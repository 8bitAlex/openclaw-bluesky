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
import { extractFacets } from "./facets.js";

const POST_CHAR_LIMIT = 300;

type SendCtx = {
  cfg: unknown;
  to: string;
  text: string;
  replyToId?: string | null;
  threadId?: string | number | null;
  accountId?: string | null;
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

  const res = await agent.post({
    text,
    ...(facets.length > 0 ? { facets: facets as never } : {}),
    ...(replyRef ? { reply: replyRef } : {}),
  });

  return {
    channel: "bluesky",
    messageId: res.uri,
    meta: { cid: res.cid },
  };
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
