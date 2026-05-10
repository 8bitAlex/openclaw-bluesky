/** Resolved Bluesky account — what config.resolveAccount() returns. */
export type BlueskyAccount = {
  accountId: string;
  handle: string;
  appPassword: string;
  /** PDS endpoint. Defaults to https://bsky.social. */
  service: string;
  /** Resolved DID (cached after first login). */
  did?: string;
};

export type BlueskyChannelConfig = {
  accounts?: Record<string, BlueskyAccountConfig>;
};

export type BlueskyAccountConfig = {
  handle: string;
  appPassword: string | SecretRef;
  service?: string;
  enabled?: boolean;
};

export type SecretRef = {
  source: "env" | "file" | "exec";
  provider?: string;
  id: string;
};
