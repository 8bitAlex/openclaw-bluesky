/**
 * Lazy AT-Protocol agent pool keyed by accountId.
 *
 * Each call to `getAgent(account, cfg)` returns a logged-in `AtpAgent`. App-
 * passwords are resolved at first login (async, since file/exec sources
 * require I/O), then the agent and its session are cached for the lifetime
 * of the process. `dispose(accountId)` evicts one (used by gateway.stopAccount).
 */
import { AtpAgent } from "@atproto/api";

import type { BlueskyAccount } from "./account.js";
import { withRetry } from "./retry.js";
import { resolveSecret } from "./secrets.js";

const agents = new Map<string, AtpAgent>();
const inflight = new Map<string, Promise<AtpAgent>>();

export async function getAgent(account: BlueskyAccount, cfg: unknown): Promise<AtpAgent> {
  const cached = agents.get(account.accountId);
  if (cached) return cached;

  const pending = inflight.get(account.accountId);
  if (pending) return pending;

  const promise = (async () => {
    const password = await resolveSecret(account.appPassword, { config: cfg });
    const agent = new AtpAgent({ service: account.service });
    await withRetry(() => agent.login({ identifier: account.handle, password }));
    agents.set(account.accountId, agent);
    return agent;
  })().finally(() => {
    inflight.delete(account.accountId);
  });

  inflight.set(account.accountId, promise);
  return promise;
}

export function dispose(accountId: string): void {
  agents.delete(accountId);
}

export function disposeAll(): void {
  agents.clear();
}
