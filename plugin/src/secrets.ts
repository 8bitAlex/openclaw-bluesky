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

type HostBatchResolver = (
  refs: SecretRef[],
  options: { config: unknown; env?: NodeJS.ProcessEnv },
) => Promise<Map<string, unknown>>;

let cached: HostBatchResolver | null | undefined;

function refKey(ref: SecretRef): string {
  return `${ref.source}:${ref.provider ?? "openclaw"}:${ref.id}`;
}

async function loadHostResolver(): Promise<HostBatchResolver | null> {
  if (cached !== undefined) return cached;
  try {
    const mod = await import("openclaw/plugin-sdk/runtime-secret-resolution");
    const fn = (mod as { resolveSecretRefValues?: unknown }).resolveSecretRefValues;
    if (typeof fn === "function") {
      cached = fn as HostBatchResolver;
      return cached;
    }
  } catch {
    // host runtime not available — fall through
  }
  cached = null;
  return null;
}

async function resolveLocal(
  ref: SecretRef,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  if (ref.source === "env") {
    const v = env[ref.id];
    if (!v) throw new Error(`bluesky: env var ${ref.id} is unset`);
    return v;
  }
  if (ref.source === "exec") {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(execFile);
    const parts = ref.id.split(/\s+/);
    const cmd = parts[0];
    if (!cmd) throw new Error("bluesky: empty exec command");
    const { stdout } = await run(cmd, parts.slice(1), { encoding: "utf8" });
    return stdout.trim();
  }
  if (ref.source === "file") {
    const { readFile } = await import("node:fs/promises");
    return (await readFile(ref.id, "utf8")).trim();
  }
  throw new Error(`bluesky: unknown secret source "${(ref as SecretRef).source}"`);
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
  if (host) {
    try {
      const map = await host([value], { config: opts.config, env: opts.env });
      const out = map.get(refKey(value)) ?? map.values().next().value;
      if (typeof out === "string") return out;
    } catch {
      // host resolver path failed — fall through to local resolution
    }
  }

  return resolveLocal(value, opts.env ?? process.env);
}
