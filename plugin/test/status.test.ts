import { describe, expect, it } from "vitest";

import { buildChannelSummary, collectPreviewWarnings } from "../src/status.js";

describe("buildChannelSummary", () => {
  it("returns disconnected when no probe", () => {
    expect(buildChannelSummary({})).toEqual({ connected: false });
  });

  it("flattens probe fields", () => {
    expect(
      buildChannelSummary({
        probe: {
          did: "did:plc:abc",
          handle: "alice.bsky.social",
          displayName: "Alice",
          followersCount: 10,
          followsCount: 20,
          postsCount: 100,
        },
      }),
    ).toEqual({
      connected: true,
      did: "did:plc:abc",
      handle: "alice.bsky.social",
      displayName: "Alice",
      followers: 10,
      following: 20,
      posts: 100,
    });
  });
});

describe("collectPreviewWarnings", () => {
  it("returns no warnings when channel block missing", () => {
    expect(collectPreviewWarnings({ cfg: {} })).toEqual([]);
  });

  it("warns about missing handle", () => {
    const w = collectPreviewWarnings({
      cfg: { channels: { bluesky: { appPassword: "abcd-efgh-ijkl-mnop" } } },
    });
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/handle is missing/);
  });

  it("warns about handle without dot", () => {
    const w = collectPreviewWarnings({
      cfg: { channels: { bluesky: { handle: "alice", appPassword: "abcd-efgh-ijkl-mnop" } } },
    });
    expect(w[0]).toMatch(/full handle/);
  });

  it("warns when appPassword does not match app-password shape", () => {
    const w = collectPreviewWarnings({
      cfg: { channels: { bluesky: { handle: "alice.bsky.social", appPassword: "MyAccountPass!" } } },
    });
    expect(w[0]).toMatch(/app-password shape/);
  });

  it("does not warn for correctly shaped app password", () => {
    const w = collectPreviewWarnings({
      cfg: { channels: { bluesky: { handle: "alice.bsky.social", appPassword: "abcd-efgh-ijkl-mnop" } } },
    });
    expect(w).toEqual([]);
  });

  it("does not warn when appPassword is a SecretRef", () => {
    const w = collectPreviewWarnings({
      cfg: {
        channels: {
          bluesky: {
            handle: "alice.bsky.social",
            appPassword: { source: "exec", id: "secret-tool ..." },
          },
        },
      },
    });
    expect(w).toEqual([]);
  });
});
