/**
 * Setup adapter — handles `openclaw channels add bluesky` and friends.
 *
 * The SDK's `ChannelSetupInput` is a fixed grab-bag of fields used by all
 * channels. We map:
 *   input.userId   -> handle (e.g. "you.bsky.social")
 *   input.password -> appPassword
 *   input.url      -> service (PDS endpoint, optional, defaults to bsky.social)
 */
type SetupInput = {
  userId?: string;
  password?: string;
  url?: string;
  name?: string;
};

type Cfg = {
  channels?: {
    bluesky?: {
      enabled?: boolean;
      handle?: string;
      appPassword?: string | { source: string; id: string };
      service?: string;
      accounts?: Record<string, { handle: string; appPassword: string; service?: string }>;
    };
  };
};

function cloneCfg<T>(cfg: T): T {
  return JSON.parse(JSON.stringify(cfg)) as T;
}

export function validateInput({ input }: { input: SetupInput }): string | null {
  const handle = input.userId?.trim();
  if (!handle) return "missing userId — pass --userId you.bsky.social";
  if (!handle.includes(".")) return `handle "${handle}" must contain a dot (e.g. you.bsky.social)`;
  if (!input.password?.trim()) {
    return "missing password — pass --password (use a Bluesky app password, not your account password)";
  }
  return null;
}

export function resolveAccountId({
  accountId,
  input,
}: {
  accountId?: string;
  input?: SetupInput;
}): string {
  if (accountId) return accountId;
  // Default accountId is "default" for the implicit single-account channel.
  // Multi-account setups can pass --accountId explicitly.
  return input?.name?.trim() || "default";
}

export function applyAccountConfig({
  cfg,
  accountId,
  input,
}: {
  cfg: Cfg;
  accountId: string;
  input: SetupInput;
}): Cfg {
  const next = cloneCfg(cfg);
  next.channels = next.channels ?? {};
  next.channels.bluesky = next.channels.bluesky ?? {};

  const handle = input.userId!.trim();
  const password = input.password!.trim();
  const service = input.url?.trim();

  if (accountId === "default") {
    // Top-level fields define the default account.
    next.channels.bluesky.enabled = true;
    next.channels.bluesky.handle = handle;
    next.channels.bluesky.appPassword = password;
    if (service) next.channels.bluesky.service = service;
  } else {
    next.channels.bluesky.accounts = next.channels.bluesky.accounts ?? {};
    next.channels.bluesky.accounts[accountId] = {
      handle,
      appPassword: password,
      ...(service ? { service } : {}),
    };
  }
  return next;
}

export const blueskySetup = {
  validateInput,
  resolveAccountId,
  applyAccountConfig,
};
