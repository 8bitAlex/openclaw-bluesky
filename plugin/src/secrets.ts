/**
 * Secret resolution wrapper. Uses the host SDK's runtime resolver when
 * available (`openclaw/plugin-sdk/runtime-secret-resolution`), and falls
 * back to a minimal env-only resolver if it's not — keeping unit tests and
 * standalone use of the package working without the full host runtime.
 */
import { isSecretRef, type SecretRef } from "./account.js";

type ResolveOptions = {
  config: unknown;
  env?: NodeJS.ProcessEnv;
};

let cached:
  | ((ref: SecretRef, opts: ResolveOptions) => Promise<string>)
  | null
  | undefined;

async function loadHostResolver(): Promise<
  ((ref: SecretRef, opts: ResolveOptions) => Promise<string>) | null
> {
  if (cached !== undefined) return cached;
  try {
    const mod = await import("openclaw/plugin-sdk/runtime-secret-resolution");
    const fn = (mod as { resolveSecretRefString?: unknown }).resolveSecretRefString;
    if (typeof fn === "function") {
      cached = fn as (ref: SecretRef, opts: ResolveOptions) => Promise<string>;
      return cached;
    }
  } catch {
    // host runtime not available — fall through to env-only
  }
  cached = null;
  return null;
}

export async function resolveSecret(
  value: string | SecretRef,
  opts: ResolveOptions,
): Promise<string> {
  if (typeof value === "string") return value;
  if (!isSecretRef(value)) {
    throw new Error("bluesky: appPassword must be a string or { source, id } secret ref");
  }

  const host = await loadHostResolver();
  if (host) return host(value, opts);

  // Fallback: env-only resolver. file/exec require the host runtime.
  if (value.source === "env") {
    const env = opts.env ?? process.env;
    const v = env[value.id];
    if (!v) throw new Error(`bluesky: env var ${value.id} is unset`);
    return v;
  }
  throw new Error(
    `bluesky: secret source "${value.source}" requires the OpenClaw host runtime ` +
      `(openclaw/plugin-sdk/runtime-secret-resolution); not available in this context`,
  );
}
