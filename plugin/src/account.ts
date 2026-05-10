/** Resolved Bluesky account. `appPassword` is left as a SecretRef when the
 *  config used a `{source, id}` ref — actual resolution happens at agent
 *  login time so we can do async file/exec reads inside the runtime. */
export type BlueskyAccount = {
  accountId: string;
  handle: string;
  appPassword: string | SecretRef;
  /** PDS endpoint. Defaults to https://bsky.social. */
  service: string;
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

export function isSecretRef(v: unknown): v is SecretRef {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as SecretRef).source === "string" &&
    typeof (v as SecretRef).id === "string"
  );
}
