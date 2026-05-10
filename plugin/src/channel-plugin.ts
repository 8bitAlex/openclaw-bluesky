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
import { resolveBlueskyTarget, sendBlueskyMedia, sendBlueskyText } from "./outbound.js";
import { applyAccountConfig, resolveAccountId, validateInput } from "./setup.js";
import { buildChannelSummary, collectPreviewWarnings, probeAccount } from "./status.js";

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
      const ids = Object.keys(channelCfg.accounts ?? {});
      if (channelCfg.handle && channelCfg.appPassword && !ids.includes("default")) {
        ids.unshift("default");
      }
      return ids;
    },
    resolveAccount(cfg: unknown, accountId?: string | null): BlueskyAccount {
      const channelCfg = readChannelConfig(cfg);
      const id = accountId ?? "default";
      // Top-level fields define the implicit "default" account.
      if (id === "default" && channelCfg.handle && channelCfg.appPassword) {
        return {
          accountId: "default",
          handle: channelCfg.handle,
          appPassword: channelCfg.appPassword,
          service: channelCfg.service ?? DEFAULT_SERVICE,
        };
      }
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
      const account = blueskyPlugin.config.resolveAccount(ctx.cfg, ctx.accountId);
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

    async sendMedia(ctx: {
      cfg: unknown;
      to: string;
      text: string;
      mediaUrl?: string;
      replyToId?: string | null;
      threadId?: string | number | null;
      accountId?: string | null;
    }) {
      const account = blueskyPlugin.config.resolveAccount(ctx.cfg, ctx.accountId);
      return sendBlueskyMedia(ctx, account);
    },
  },

  setup: {
    validateInput,
    resolveAccountId,
    applyAccountConfig,
  },

  status: {
    probeAccount,
    buildChannelSummary,
  },

  doctor: {
    collectPreviewWarnings,
  },

  gateway: {
    /**
     * Returns a promise that resolves only when ctx.abortSignal aborts
     * — the host treats earlier resolution as "channel exited" and
     * auto-restarts. See gateway.ts for the lifecycle contract.
     */
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
    }): Promise<void> {
      await gatewayStart(ctx);
    },
    async stopAccount(ctx: { accountId: string }): Promise<void> {
      // The host aborts ctx.abortSignal which lets startAccount resolve;
      // we only need to clear the cached AtpAgent here.
      dispose(ctx.accountId);
    },
  },
};

export { extractFacets };
