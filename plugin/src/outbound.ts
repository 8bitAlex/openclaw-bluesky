/**
 * Outbound send implementations. Wired into `blueskyPlugin.outbound` via the
 * `sendText` / `sendFormattedText` hooks defined by `ChannelOutboundAdapter`.
 *
 * `to:` accepts:
 *   - a bare handle (`alice.bsky.social`)
 *   - a `user:<handle-or-did>` prefixed target
 *   - a `did:plc:...` direct DID
 *   - an `at://...` post URI (for thread replies)
 *
 * Replies: when `replyToId` is set to a post URI, we look up the parent and
 * its root and build an AT Proto reply ref.
 */
import type { AtpAgent } from "@atproto/api";

import type { BlueskyAccount } from "./account.js";
import { getAgent } from "./agent-pool.js";
import { fetchExternalCard } from "./embeds.js";
import { extractFacets } from "./facets.js";
import { buildImagesEmbed, type ImageInput, uploadImages } from "./media.js";
import { withRetry } from "./retry.js";

const POST_CHAR_LIMIT = 300;

type SendCtx = {
  cfg: unknown;
  to: string;
  text: string;
  replyToId?: string | null;
  threadId?: string | number | null;
  accountId?: string | null;
  /** Single media URL — populated by OpenClaw's outbound dispatch. */
  mediaUrl?: string;
  /** Pre-loaded media buffer + alt text — used by sendMedia. */
  mediaBuffers?: Array<{ data: Buffer; mimeType: string; alt?: string }>;
  /** Quote post — `at://` URI of the post being quoted. Internal extension. */
  quoteOf?: string;
  /** External link card — URL to fetch OpenGraph metadata from. Internal extension. */
  externalLink?: string;
};

type SendResult = {
  channel: "bluesky";
  messageId: string;
  meta?: Record<string, unknown>;
};

function stripPrefix(s: string, prefix: string): string {
  return s.startsWith(prefix) ? s.slice(prefix.length) : s;
}

function isDid(s: string): boolean {
  return s.startsWith("did:");
}

function isPostUri(s: string): boolean {
  return s.startsWith("at://");
}

async function resolveActor(agent: AtpAgent, raw: string): Promise<string> {
  const t = stripPrefix(stripPrefix(raw, "user:"), "@");
  if (isDid(t)) return t;
  const res = await agent.resolveHandle({ handle: t });
  return res.data.did;
}

async function buildReply(
  agent: AtpAgent,
  parentUri: string,
): Promise<{ root: { uri: string; cid: string }; parent: { uri: string; cid: string } }> {
  const res = await agent.getPosts({ uris: [parentUri] });
  const parent = res.data.posts[0];
  if (!parent) throw new Error(`bluesky: parent post not found: ${parentUri}`);
  const parentRecord = parent.record as { reply?: { root?: { uri: string; cid: string } } };
  const root = parentRecord.reply?.root ?? { uri: parent.uri, cid: parent.cid };
  return {
    root: { uri: root.uri, cid: root.cid },
    parent: { uri: parent.uri, cid: parent.cid },
  };
}

export async function sendBlueskyText(
  ctx: SendCtx,
  account: BlueskyAccount,
): Promise<SendResult> {
  const agent = await getAgent(account, ctx.cfg);

  const text = ctx.text.length > POST_CHAR_LIMIT
    ? ctx.text.slice(0, POST_CHAR_LIMIT - 1) + "…"
    : ctx.text;

  const facets = await extractFacets(text, async (handle) => {
    try {
      const r = await agent.resolveHandle({ handle });
      return r.data.did;
    } catch {
      return null;
    }
  });

  // Determine if this is a reply (replyToId is a post URI) or a top-level
  // post addressed to a user. A user/DID `to:` without `replyToId` posts a
  // public skeet that mentions the recipient — the closest analogue Bluesky
  // has to a DM short of the chat.bsky.* lexicon (TBD in Phase 5).
  let replyRef: Awaited<ReturnType<typeof buildReply>> | undefined;
  if (ctx.replyToId && isPostUri(ctx.replyToId)) {
    replyRef = await buildReply(agent, ctx.replyToId);
  } else if (isPostUri(ctx.to)) {
    replyRef = await buildReply(agent, ctx.to);
  }

  if (!replyRef && ctx.to && !isPostUri(ctx.to)) {
    // Public mention-style post addressed to a user.
    const did = await resolveActor(agent, ctx.to);
    // Already in facets if user wrote `@handle`; otherwise we don't synthesize
    // a mention here — agents should write the @handle into the text body.
    void did;
  }

  // Assemble image inputs (URL or pre-loaded buffer).
  const imageInputs: ImageInput[] = [];
  if (ctx.mediaUrl) imageInputs.push({ kind: "url", url: ctx.mediaUrl });
  if (ctx.mediaBuffers) {
    for (const m of ctx.mediaBuffers) {
      imageInputs.push({ kind: "buffer", data: m.data, mimeType: m.mimeType, alt: m.alt });
    }
  }
  const uploaded = imageInputs.length > 0 ? await uploadImages(agent, imageInputs) : [];

  // Bluesky allows exactly one top-level embed. Combinations:
  //   images + quote      -> app.bsky.embed.recordWithMedia
  //   images alone        -> app.bsky.embed.images
  //   quote alone         -> app.bsky.embed.record
  //   external alone      -> app.bsky.embed.external
  //   external + (images|quote) -> external is dropped (no equivalent combo)
  let embed: Record<string, unknown> | undefined;
  let quoteRecord: { uri: string; cid: string } | undefined;
  if (ctx.quoteOf) {
    const quoted = await withRetry(() => agent.getPosts({ uris: [ctx.quoteOf!] }));
    const post = quoted.data.posts[0];
    if (!post) throw new Error(`bluesky: quote target not found: ${ctx.quoteOf}`);
    quoteRecord = { uri: post.uri, cid: post.cid };
  }

  if (uploaded.length > 0 && quoteRecord) {
    embed = {
      $type: "app.bsky.embed.recordWithMedia",
      record: { record: quoteRecord },
      media: buildImagesEmbed(uploaded),
    };
  } else if (uploaded.length > 0) {
    embed = buildImagesEmbed(uploaded);
  } else if (quoteRecord) {
    embed = { $type: "app.bsky.embed.record", record: quoteRecord };
  } else if (ctx.externalLink) {
    embed = await fetchExternalCard(agent, ctx.externalLink);
  }

  const res = await withRetry(() =>
    agent.post({
      text,
      ...(facets.length > 0 ? { facets: facets as never } : {}),
      ...(replyRef ? { reply: replyRef } : {}),
      ...(embed ? { embed: embed as never } : {}),
    }),
  );

  return {
    channel: "bluesky",
    messageId: res.uri,
    meta: { cid: res.cid },
  };
}

export async function sendBlueskyMedia(
  ctx: SendCtx,
  account: BlueskyAccount,
): Promise<SendResult> {
  if (!ctx.mediaUrl && !ctx.mediaBuffers?.length) {
    throw new Error("bluesky: sendMedia called without mediaUrl or mediaBuffers");
  }
  return sendBlueskyText(ctx, account);
}

export function resolveBlueskyTarget(params: {
  to?: string;
}): { ok: true; to: string } | { ok: false; error: Error } {
  const raw = params.to?.trim();
  if (!raw) return { ok: false, error: new Error("bluesky: empty target") };

  if (isPostUri(raw) || isDid(raw)) return { ok: true, to: raw };

  const stripped = stripPrefix(stripPrefix(raw, "user:"), "@");
  if (!stripped.includes(".")) {
    return {
      ok: false,
      error: new Error(
        `bluesky: target "${raw}" is not a handle (must contain a dot), DID, or post URI`,
      ),
    };
  }
  return { ok: true, to: stripped };
}
