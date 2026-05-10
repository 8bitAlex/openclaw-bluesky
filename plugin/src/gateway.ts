/**
 * Per-account gateway: polls AT Proto notifications and surfaces mentions/
 * replies as channel events for the agent runtime.
 *
 * Bluesky doesn't push per-account events to a webhook — the canonical
 * inbound is `app.bsky.notification.listNotifications` with cursor +
 * `seenAt` updated via `updateSeen`. We poll on an interval; rate limits
 * are generous (default 30s feels right; Discord polls similarly for
 * lazy gateways).
 *
 * The actual event-dispatch happens via `ctx.channelRuntime?.reply` when
 * the host provides it. Without that surface (standalone use, tests) we
 * just log; this matches the SDK's "external plugin" pattern.
 */
import type { AppBskyNotificationListNotifications } from "@atproto/api";

import type { BlueskyAccount } from "./account.js";
import { getAgent } from "./agent-pool.js";
import { withRetry } from "./retry.js";

const DEFAULT_POLL_MS = 30_000;
const RELEVANT_REASONS = new Set([
  "mention",
  "reply",
  "quote",
  // intentionally NOT polling "follow" / "like" / "repost" by default —
  // they're not actionable for an agent and would be noisy. Configurable
  // in a future phase.
]);

type Notification = AppBskyNotificationListNotifications.Notification;

type GatewayCtx = {
  accountId: string;
  account: BlueskyAccount;
  cfg: unknown;
  abortSignal: AbortSignal;
  log?: { info?: (msg: string) => void; warn?: (msg: string) => void; error?: (msg: string) => void };
  channelRuntime?: {
    reply?: (params: {
      channel: string;
      accountId: string;
      from: string;
      text: string;
      threadId?: string;
    }) => Promise<void> | void;
  };
};

/**
 * The host treats the resolution of `startAccount`'s promise as "channel
 * exited" and triggers an auto-restart with backoff. We must keep the
 * promise pending for the lifetime of the channel — resolving only when
 * `ctx.abortSignal` aborts (which is what `stopAccount` does).
 */
export async function startAccount(ctx: GatewayCtx): Promise<void> {
  const agent = await getAgent(ctx.account, ctx.cfg);
  let lastSeen = new Date().toISOString();

  const tick = async (): Promise<void> => {
    if (ctx.abortSignal.aborted) return;
    try {
      const res = await withRetry(() =>
        agent.app.bsky.notification.listNotifications({ limit: 50 }),
      );
      const fresh: Notification[] = [];
      for (const n of res.data.notifications) {
        if (!RELEVANT_REASONS.has(n.reason)) continue;
        if (n.indexedAt <= lastSeen) continue;
        fresh.push(n);
      }
      if (fresh.length > 0) {
        for (const n of fresh) {
          const text = (n.record as { text?: string }).text ?? "";
          const threadId = (n.record as { reply?: { root?: { uri?: string } } }).reply?.root
            ?.uri ?? n.uri;
          await ctx.channelRuntime?.reply?.({
            channel: "bluesky",
            accountId: ctx.accountId,
            from: n.author.did,
            text,
            threadId,
          });
          ctx.log?.info?.(`bluesky: ${n.reason} from @${n.author.handle}`);
        }
        lastSeen = fresh[fresh.length - 1]!.indexedAt;
        await withRetry(() => agent.app.bsky.notification.updateSeen({ seenAt: lastSeen }));
      }
    } catch (err) {
      ctx.log?.warn?.(`bluesky: poll error: ${(err as Error).message}`);
    }
  };

  const interval = setInterval(() => {
    void tick();
  }, DEFAULT_POLL_MS);

  ctx.log?.info?.(`bluesky: account ${ctx.accountId} started, polling every ${DEFAULT_POLL_MS}ms`);

  // Keep the start promise pending for the channel's lifetime. The host
  // aborts the signal via stopAccount; we resolve in response.
  await new Promise<void>((resolve) => {
    if (ctx.abortSignal.aborted) {
      clearInterval(interval);
      resolve();
      return;
    }
    ctx.abortSignal.addEventListener(
      "abort",
      () => {
        clearInterval(interval);
        resolve();
      },
      { once: true },
    );
  });
}
