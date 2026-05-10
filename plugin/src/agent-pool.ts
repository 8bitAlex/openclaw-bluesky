/**
 * Lazy AT-Protocol agent pool keyed by accountId.
 *
 * Each call to `getAgent(account)` returns a logged-in `AtpAgent`. Agents are
 * cached for the lifetime of the process; `dispose(accountId)` evicts one
 * (used by gateway.stopAccount).
 */
import { AtpAgent } from "@atproto/api";

import type { BlueskyAccount } from "./account.js";

const agents = new Map<string, AtpAgent>();

export async function getAgent(account: BlueskyAccount): Promise<AtpAgent> {
  const cached = agents.get(account.accountId);
  if (cached) return cached;

  const agent = new AtpAgent({ service: account.service });
  await agent.login({ identifier: account.handle, password: account.appPassword });
  agents.set(account.accountId, agent);
  return agent;
}

export function dispose(accountId: string): void {
  agents.delete(accountId);
}

export function disposeAll(): void {
  agents.clear();
}
