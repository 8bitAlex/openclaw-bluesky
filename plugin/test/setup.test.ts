import { describe, expect, it } from "vitest";

import { applyAccountConfig, resolveAccountId, validateInput } from "../src/setup.js";

describe("validateInput", () => {
  it("accepts a complete input", () => {
    expect(
      validateInput({ input: { userId: "alice.bsky.social", password: "abcd-efgh-ijkl-mnop" } }),
    ).toBeNull();
  });

  it("rejects missing userId", () => {
    expect(validateInput({ input: { password: "x" } })).toMatch(/missing userId/);
  });

  it("rejects handle without dot", () => {
    expect(validateInput({ input: { userId: "alice", password: "x" } })).toMatch(
      /must contain a dot/,
    );
  });

  it("rejects missing password", () => {
    expect(validateInput({ input: { userId: "alice.bsky.social" } })).toMatch(/missing password/);
  });
});

describe("resolveAccountId", () => {
  it("returns 'default' when no name provided", () => {
    expect(resolveAccountId({ input: { userId: "a.b" } })).toBe("default");
  });

  it("uses provided name", () => {
    expect(resolveAccountId({ input: { userId: "a.b", name: "alt" } })).toBe("alt");
  });

  it("explicit accountId wins over input.name", () => {
    expect(resolveAccountId({ accountId: "given", input: { name: "ignored" } })).toBe("given");
  });
});

describe("applyAccountConfig", () => {
  it("writes default account at top level", () => {
    const cfg = applyAccountConfig({
      cfg: {},
      accountId: "default",
      input: { userId: "alice.bsky.social", password: "pw" },
    });
    expect(cfg.channels?.bluesky).toEqual({
      enabled: true,
      handle: "alice.bsky.social",
      appPassword: "pw",
    });
  });

  it("writes named account under accounts.<id>", () => {
    const cfg = applyAccountConfig({
      cfg: {},
      accountId: "work",
      input: { userId: "alice.work", password: "pw" },
    });
    expect(cfg.channels?.bluesky?.accounts?.work).toEqual({
      handle: "alice.work",
      appPassword: "pw",
    });
  });

  it("preserves existing channels config", () => {
    const cfg = applyAccountConfig({
      cfg: { channels: { bluesky: { service: "https://my-pds.example" } } } as never,
      accountId: "default",
      input: { userId: "a.b", password: "pw" },
    });
    expect(cfg.channels?.bluesky?.service).toBe("https://my-pds.example");
    expect(cfg.channels?.bluesky?.handle).toBe("a.b");
  });

  it("includes service when input.url is provided", () => {
    const cfg = applyAccountConfig({
      cfg: {},
      accountId: "default",
      input: { userId: "a.b", password: "pw", url: "https://my-pds.example" },
    });
    expect(cfg.channels?.bluesky?.service).toBe("https://my-pds.example");
  });
});
