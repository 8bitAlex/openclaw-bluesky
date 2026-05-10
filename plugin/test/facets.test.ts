import { describe, expect, it } from "vitest";

import { extractFacets } from "../src/facets.js";

const noResolve = async () => null;
const fixedResolve = async (h: string) =>
  h === "bsky.app" ? "did:plc:z72i7hdynmk6r22z27h6tvur" : null;

describe("extractFacets", () => {
  it("returns empty for plain text", async () => {
    const f = await extractFacets("nothing to see here", noResolve);
    expect(f).toEqual([]);
  });

  it("detects URLs and trims trailing punctuation", async () => {
    const text = "see https://example.com/foo!";
    const f = await extractFacets(text, noResolve);
    expect(f).toHaveLength(1);
    expect(f[0]!.features[0]).toEqual({
      $type: "app.bsky.richtext.facet#link",
      uri: "https://example.com/foo",
    });
    const span = Buffer.from(text, "utf-8")
      .slice(f[0]!.index.byteStart, f[0]!.index.byteEnd)
      .toString("utf-8");
    expect(span).toBe("https://example.com/foo");
  });

  it("balances trailing parentheses", async () => {
    const text = "see (https://example.com/foo)";
    const f = await extractFacets(text, noResolve);
    expect(f[0]!.features[0]).toMatchObject({ uri: "https://example.com/foo" });
  });

  it("detects hashtags but not pure numbers", async () => {
    const f = await extractFacets("#golang and #123 and #devtools", noResolve);
    const tags = f.map((x) => (x.features[0] as { tag: string }).tag);
    expect(tags).toEqual(["golang", "devtools"]);
  });

  it("resolves mentions when handle has a dot", async () => {
    const f = await extractFacets("hi @bsky.app", fixedResolve);
    expect(f).toHaveLength(1);
    expect(f[0]!.features[0]).toMatchObject({
      $type: "app.bsky.richtext.facet#mention",
      did: "did:plc:z72i7hdynmk6r22z27h6tvur",
    });
  });

  it("skips mentions without dots", async () => {
    const f = await extractFacets("hi @bsky", fixedResolve);
    expect(f).toEqual([]);
  });

  it("skips mentions that fail to resolve", async () => {
    const f = await extractFacets("hi @nobody.example", fixedResolve);
    expect(f).toEqual([]);
  });

  it("computes correct UTF-8 byte offsets with emoji", async () => {
    // ⭐ is 3 bytes in UTF-8, 🦋 is 4 bytes, — is 3 bytes
    const text = "raid ⭐ — see https://github.com/8bitAlex/raid #golang";
    const f = await extractFacets(text, noResolve);
    expect(f).toHaveLength(2);
    const buf = Buffer.from(text, "utf-8");
    for (const facet of f) {
      const span = buf
        .slice(facet.index.byteStart, facet.index.byteEnd)
        .toString("utf-8");
      const feat = facet.features[0];
      const target = "uri" in feat ? feat.uri : "tag" in feat ? `#${feat.tag}` : "";
      expect(span).toBe(target);
    }
  });

  it("handles multiple URLs and tags in one post", async () => {
    const text = "links: https://a.com https://b.com #x #y";
    const f = await extractFacets(text, noResolve);
    const kinds = f.map((x) => x.features[0].$type.split("#")[1]);
    expect(kinds).toEqual(["link", "link", "tag", "tag"]);
  });
});
