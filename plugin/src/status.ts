/**
 * Status + doctor adapters. The status adapter probes the account by hitting
 * `app.bsky.actor.getProfile(did)` for our own DID — that exercises auth and
 * the PDS connection, and the response gives us nice summary fields
 * (followers, posts, display name).
 */
import type { BlueskyAccount } from "./account.js";
import { getAgent } from "./agent-pool.js";
import { withRetry } from "./retry.js";

export type BlueskyProbe = {
  did: string;
  handle: string;
  displayName?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
};

export async function probeAccount({
  account,
  cfg,
  timeoutMs,
}: {
  account: BlueskyAccount;
  cfg: unknown;
  timeoutMs: number;
}): Promise<BlueskyProbe> {
  const agent = await Promise.race([
    getAgent(account, cfg),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`bluesky probe timed out after ${timeoutMs}ms`)), timeoutMs),
    ),
  ]);
  const me = agent.session?.did;
  if (!me) throw new Error("bluesky: no session DID after login");
  const profile = await withRetry(() => agent.getProfile({ actor: me }));
  return {
    did: profile.data.did,
    handle: profile.data.handle,
    displayName: profile.data.displayName,
    followersCount: profile.data.followersCount,
    followsCount: profile.data.followsCount,
    postsCount: profile.data.postsCount,
  };
}

export function buildChannelSummary({
  probe,
}: {
  probe?: BlueskyProbe;
}): Record<string, unknown> {
  if (!probe) return { connected: false };
  return {
    connected: true,
    handle: probe.handle,
    did: probe.did,
    displayName: probe.displayName,
    followers: probe.followersCount,
    following: probe.followsCount,
    posts: probe.postsCount,
  };
}

/** Doctor — minimal for now. Reports whether handle/appPassword are present
 *  and warns if appPassword looks like a real account password instead of an
 *  app password (account passwords don't have the dash-separated 4x4 shape). */
export function collectPreviewWarnings({ cfg }: { cfg: unknown }): string[] {
  const warnings: string[] = [];
  const ch = (cfg as { channels?: { bluesky?: { handle?: string; appPassword?: unknown } } })
    ?.channels?.bluesky;
  if (!ch) return warnings;
  if (!ch.handle) {
    warnings.push("channels.bluesky.handle is missing");
  } else if (!ch.handle.includes(".")) {
    warnings.push(`channels.bluesky.handle "${ch.handle}" should be a full handle like you.bsky.social`);
  }
  if (typeof ch.appPassword === "string" && /^[a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4}$/i.test(ch.appPassword)) {
    // shape OK — likely a Bluesky app password
  } else if (typeof ch.appPassword === "string" && ch.appPassword.length > 0) {
    warnings.push(
      "channels.bluesky.appPassword is a literal string and doesn't match the app-password shape " +
        "(xxxx-xxxx-xxxx-xxxx). Generate one at https://bsky.app/settings/app-passwords or use a {source,id} secret ref.",
    );
  }
  return warnings;
}
