/**
 * The Bluesky ChannelPlugin object.
 *
 * Status: scaffold. `config.listAccountIds` and `config.resolveAccount` are
 * implemented against a placeholder config shape; `outbound` and `gateway`
 * are stubbed with TODO bodies. The full adapter contract is wide
 * (~25 optional adapters) — we'll fill in only what's needed as Phase 3
 * progresses. See ../../docs/PLUGIN_SDK.md for the contract.
 */
import type { BlueskyAccount, BlueskyAccountConfig, BlueskyChannelConfig, SecretRef } from "./account.js";
import { extractFacets } from "./facets.js";
import { dispose, getAgent } from "./agent-pool.js";

const DEFAULT_SERVICE = "https://bsky.social";

function readChannelConfig(cfg: any): BlueskyChannelConfig {
  return cfg?.channels?.bluesky ?? {};
}

function resolveSecret(value: string | SecretRef, env: NodeJS.ProcessEnv = process.env): string {
  if (typeof value === "string") return value;
  if (value.source === "env") {
    const v = env[value.id];
    if (!v) throw new Error(`bluesky: env var ${value.id} is unset`);
    return v;
  }
  // file/exec sources: deferred to runtime helpers in Phase 3.
  throw new Error(`bluesky: secret source "${value.source}" not yet implemented`);
}

function resolveAccountConfig(
  accountId: string,
  raw: BlueskyAccountConfig,
): BlueskyAccount {
  return {
    accountId,
    handle: raw.handle,
    appPassword: resolveSecret(raw.appPassword),
    service: raw.service ?? DEFAULT_SERVICE,
  };
}

// ChannelPlugin is not in the public-surface exports — plugins build the
// object structurally, and the host validates it via `loadChannelPlugin()`.
// We rely on inference here; runtime errors surface during host `registerChannel`.
export const blueskyPlugin = {
  id: "bluesky" as const,

  meta: {
    id: "bluesky" as const,
    label: "Bluesky",
    selectionLabel: "Bluesky (AT Protocol)",
    detailLabel: "Bluesky",
    docsPath: "/channels/bluesky",
    docsLabel: "bluesky",
    blurb: "Post and read on Bluesky via AT Protocol app passwords.",
    markdownCapable: false,
  },

  capabilities: {
    chatTypes: ["dm", "thread"] as const,
    media: true,
    reactions: true,
    edit: false,
    unsend: true,
    reply: true,
    threads: true,
  },

  config: {
    listAccountIds(cfg: unknown): string[] {
      const channelCfg = readChannelConfig(cfg);
      return Object.keys(channelCfg.accounts ?? {});
    },
    resolveAccount(cfg: unknown, accountId?: string | null): BlueskyAccount {
      const channelCfg = readChannelConfig(cfg);
      const id = accountId ?? Object.keys(channelCfg.accounts ?? {})[0];
      if (!id) throw new Error("bluesky: no accounts configured");
      const raw = channelCfg.accounts?.[id];
      if (!raw) throw new Error(`bluesky: unknown accountId "${id}"`);
      return resolveAccountConfig(id, raw);
    },
    isConfigured(account: BlueskyAccount): boolean {
      return Boolean(account?.handle && account?.appPassword);
    },
  },

  outbound: {
    deliveryMode: "direct" as const,
    // TODO(phase-3): implement the actual delivery hook.
    // The send-text path likely wires through `renderPresentation` /
    // `beforeDeliverPayload`. Need to read more of outbound.types.d.ts and
    // see how Discord's outbound is composed at runtime to know which hook
    // is the right place to call `agent.post(...)`. For now this is a
    // stub that advertises capabilities only.
  },

  gateway: {
    // TODO(phase-3): poll `app.bsky.notification.listNotifications` on an
    // interval, dispatch new mentions/replies/follows as channel events.
    async startAccount(_ctx: { accountId: string; account: BlueskyAccount }): Promise<void> {
      // no-op until Phase 3
    },
    async stopAccount(ctx: { accountId: string }): Promise<void> {
      dispose(ctx.accountId);
    },
  },
};

// Re-export utilities the Phase 3 implementation will use.
export { extractFacets, getAgent };
