import { describe, expect, it } from "vitest";

import { resolveBlueskyTarget } from "../src/outbound.js";

describe("resolveBlueskyTarget", () => {
  it("accepts bare handles", () => {
    expect(resolveBlueskyTarget({ to: "alice.bsky.social" })).toEqual({
      ok: true,
      to: "alice.bsky.social",
    });
  });

  it("strips @ prefix", () => {
    expect(resolveBlueskyTarget({ to: "@bsky.app" })).toEqual({
      ok: true,
      to: "bsky.app",
    });
  });

  it("strips user: prefix", () => {
    expect(resolveBlueskyTarget({ to: "user:alice.bsky.social" })).toEqual({
      ok: true,
      to: "alice.bsky.social",
    });
  });

  it("passes DIDs through unchanged", () => {
    expect(resolveBlueskyTarget({ to: "did:plc:abc" })).toEqual({
      ok: true,
      to: "did:plc:abc",
    });
  });

  it("passes post URIs through unchanged", () => {
    const uri = "at://did:plc:abc/app.bsky.feed.post/123";
    expect(resolveBlueskyTarget({ to: uri })).toEqual({ ok: true, to: uri });
  });

  it("rejects empty target", () => {
    const r = resolveBlueskyTarget({ to: "" });
    expect(r.ok).toBe(false);
  });

  it("rejects handles without a dot", () => {
    const r = resolveBlueskyTarget({ to: "alice" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/must contain a dot/);
  });

  it("trims whitespace", () => {
    expect(resolveBlueskyTarget({ to: "  alice.bsky.social  " })).toEqual({
      ok: true,
      to: "alice.bsky.social",
    });
  });
});
