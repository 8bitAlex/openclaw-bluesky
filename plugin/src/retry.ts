/**
 * AT-Protocol-aware retry helper.
 *
 * The Bluesky API returns:
 *   - 429 Too Many Requests with `Retry-After` (seconds or HTTP-date)
 *   - 5xx for transient backend issues
 * Other 4xx (including auth failures) should NOT retry — we let those bubble.
 *
 * `@atproto/api` surfaces HTTP errors as `XRPCError` with `.status` and a
 * `.headers` map. We pattern-match defensively (the type isn't always
 * exposed) and fall back to "don't retry" if the shape is unrecognised.
 */

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 30_000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export type RetryOptions = {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Inject a sleep function (used in tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Inject the time source for parsing Retry-After dates (used in tests). */
  now?: () => number;
};

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function getStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function getHeader(err: unknown, name: string): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const headers = (err as { headers?: unknown }).headers;
  if (!headers) return undefined;
  if (headers instanceof Map) {
    const v = headers.get(name) ?? headers.get(name.toLowerCase());
    return typeof v === "string" ? v : undefined;
  }
  if (typeof headers === "object") {
    const rec = headers as Record<string, unknown>;
    const v = rec[name] ?? rec[name.toLowerCase()];
    return typeof v === "string" ? v : undefined;
  }
  return undefined;
}

export function isRetryable(err: unknown): boolean {
  const status = getStatus(err);
  if (status === undefined) return false;
  return RETRYABLE_STATUSES.has(status);
}

export function parseRetryAfter(header: string | undefined, now: number): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) {
    return Math.max(0, parseInt(trimmed, 10) * 1000);
  }
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, parsed - now);
}

/**
 * Computes the backoff delay for a given attempt:
 *   - if Retry-After header is set, use it (capped by maxDelayMs)
 *   - else exponential: base * 2^attempt, with up to ±25% jitter, capped
 */
export function backoffDelay(
  attempt: number,
  err: unknown,
  opts: { baseDelayMs: number; maxDelayMs: number; now: number },
): number {
  const ra = parseRetryAfter(getHeader(err, "Retry-After"), opts.now);
  if (ra !== null) return Math.min(ra, opts.maxDelayMs);
  const exp = Math.min(opts.baseDelayMs * 2 ** attempt, opts.maxDelayMs);
  const jitter = exp * (0.5 - Math.random()) * 0.5; // ±12.5% (random in [-0.125, +0.125])
  return Math.max(0, Math.floor(exp + jitter));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const sleep = opts.sleep ?? realSleep;
  const now = opts.now ?? Date.now;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxRetries || !isRetryable(err)) throw err;
      const delay = backoffDelay(attempt, err, {
        baseDelayMs,
        maxDelayMs,
        now: now(),
      });
      await sleep(delay);
    }
  }
  throw lastErr;
}
