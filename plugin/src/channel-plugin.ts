/**
 * The Bluesky ChannelPlugin object.
 *
 * `ChannelPlugin` is not in the SDK's public exports — plugins build the
 * object structurally and the host validates it via `loadChannelPlugin()`.
 * See ../../docs/PLUGIN_SDK.md for the contract.
 */
import type { BlueskyAccount, BlueskyAccountConfig, BlueskyChannelConfig } from "./account.js";
import { dispose } from "./agent-pool.js";
import { extractFacets } from "./facets.js";
import { startAccount as gatewayStart } from "./gateway.js";
import { resolveBlueskyTarget, sendBlueskyText } from "./outbound.js";

const DEFAULT_SERVICE = "https://bsky.social";

function readChannelConfig(cfg: unknown): BlueskyChannelConfig {
  return ((cfg as { channels?: { bluesky?: BlueskyChannelConfig } })?.channels?.bluesky) ?? {};
}

function resolveAccountConfig(
  accountId: string,
  raw: BlueskyAccountConfig,
): BlueskyAccount {
  return {
    accountId,
    handle: raw.handle,
    appPassword: raw.appPassword, // SecretRef left unresolved until login
    service: raw.service ?? DEFAULT_SERVICE,
  };
}

const handles: Map<string, { stop: () => void }> = new Map();

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
    media: false, // Phase 5 — needs blob upload
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
    describeAccount(account: BlueskyAccount): { id: string; label: string } {
      return { id: account.accountId, label: `@${account.handle}` };
    },
  },

  outbound: {
    deliveryMode: "direct" as const,
    textChunkLimit: 300,

    resolveTarget(params: { to?: string }) {
      return resolveBlueskyTarget(params);
    },

    async sendText(ctx: {
      cfg: unknown;
      to: string;
      text: string;
      replyToId?: string | null;
      threadId?: string | number | null;
      accountId?: string | null;
    }) {
      const channelCfg = readChannelConfig(ctx.cfg);
      const id = ctx.accountId ?? Object.keys(channelCfg.accounts ?? {})[0];
      if (!id || !channelCfg.accounts?.[id]) {
        throw new Error("bluesky: no account available for sendText");
      }
      const account = resolveAccountConfig(id, channelCfg.accounts[id]);
      return sendBlueskyText(ctx, account);
    },

    async sendFormattedText(ctx: {
      cfg: unknown;
      to: string;
      text: string;
      replyToId?: string | null;
      threadId?: string | number | null;
      accountId?: string | null;
    }) {
      const result = await this.sendText(ctx);
      return [result];
    },
  },

  gateway: {
    async startAccount(ctx: {
      accountId: string;
      account: BlueskyAccount;
      cfg: unknown;
      abortSignal: AbortSignal;
      log?: {
        info?: (msg: string) => void;
        warn?: (msg: string) => void;
        error?: (msg: string) => void;
      };
      channelRuntime?: {
        reply?: (params: {
          channel: string;
          accountId: string;
          from: string;
          text: string;
          threadId?: string;
        }) => Promise<void> | void;
      };
    }): Promise<{ stop: () => void }> {
      const handle = await gatewayStart(ctx);
      handles.set(ctx.accountId, handle);
      return handle;
    },
    async stopAccount(ctx: { accountId: string }): Promise<void> {
      handles.get(ctx.accountId)?.stop();
      handles.delete(ctx.accountId);
      dispose(ctx.accountId);
    },
  },
};

export { extractFacets };
