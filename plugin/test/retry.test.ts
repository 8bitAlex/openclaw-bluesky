import { describe, expect, it, vi } from "vitest";

import { backoffDelay, isRetryable, parseRetryAfter, withRetry } from "../src/retry.js";

class FakeXrpcError extends Error {
  constructor(
    public status: number,
    public headers: Record<string, string> = {},
  ) {
    super(`status ${status}`);
  }
}

describe("isRetryable", () => {
  it("matches 429 / 500 / 502 / 503 / 504", () => {
    for (const s of [429, 500, 502, 503, 504]) {
      expect(isRetryable(new FakeXrpcError(s))).toBe(true);
    }
  });

  it("does not match 4xx other than 429", () => {
    for (const s of [400, 401, 403, 404, 422]) {
      expect(isRetryable(new FakeXrpcError(s))).toBe(false);
    }
  });

  it("does not match plain Errors", () => {
    expect(isRetryable(new Error("nope"))).toBe(false);
  });

  it("does not match null/undefined", () => {
    expect(isRetryable(null)).toBe(false);
    expect(isRetryable(undefined)).toBe(false);
  });
});

describe("parseRetryAfter", () => {
  it("parses integer seconds", () => {
    expect(parseRetryAfter("5", 0)).toBe(5000);
  });

  it("parses HTTP-date relative to now", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:30 GMT", now)).toBe(30_000);
  });

  it("clamps negative deltas to 0", () => {
    const now = Date.parse("2026-01-01T00:01:00Z");
    expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:00 GMT", now)).toBe(0);
  });

  it("returns null for unparseable header", () => {
    expect(parseRetryAfter("garbage", 0)).toBeNull();
    expect(parseRetryAfter(undefined, 0)).toBeNull();
  });
});

describe("backoffDelay", () => {
  it("honors Retry-After when present", () => {
    const err = new FakeXrpcError(429, { "Retry-After": "7" });
    const d = backoffDelay(0, err, { baseDelayMs: 500, maxDelayMs: 60_000, now: 0 });
    expect(d).toBe(7000);
  });

  it("caps Retry-After at maxDelayMs", () => {
    const err = new FakeXrpcError(429, { "Retry-After": "120" });
    const d = backoffDelay(0, err, { baseDelayMs: 500, maxDelayMs: 30_000, now: 0 });
    expect(d).toBe(30_000);
  });

  it("uses exponential backoff with jitter when no header", () => {
    const err = new FakeXrpcError(503);
    const samples = Array.from({ length: 50 }, () =>
      backoffDelay(2, err, { baseDelayMs: 500, maxDelayMs: 60_000, now: 0 }),
    );
    // 500 * 2^2 = 2000, ±12.5% = roughly [1750, 2250]
    for (const s of samples) {
      expect(s).toBeGreaterThanOrEqual(1500);
      expect(s).toBeLessThanOrEqual(2500);
    }
  });
});

describe("withRetry", () => {
  it("passes through on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const out = await withRetry(fn);
    expect(out).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 then succeeds", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 3) throw new FakeXrpcError(429, { "Retry-After": "0" });
      return "ok";
    };
    const out = await withRetry(fn, { sleep: async () => {} });
    expect(out).toBe("ok");
    expect(calls).toBe(3);
  });

  it("does not retry non-retryable errors", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new FakeXrpcError(401);
    };
    await expect(withRetry(fn, { sleep: async () => {} })).rejects.toThrow(/status 401/);
    expect(calls).toBe(1);
  });

  it("gives up after maxRetries and rethrows the last error", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new FakeXrpcError(503);
    };
    await expect(
      withRetry(fn, { maxRetries: 2, sleep: async () => {} }),
    ).rejects.toThrow(/status 503/);
    expect(calls).toBe(3); // initial + 2 retries
  });
});
