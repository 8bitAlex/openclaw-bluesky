import { describe, expect, it } from "vitest";

import { parseOpenGraph } from "../src/embeds.js";

describe("parseOpenGraph", () => {
  it("returns empty for HTML with no metadata", () => {
    expect(parseOpenGraph("<html><body>hi</body></html>")).toEqual({});
  });

  it("extracts <title>", () => {
    expect(parseOpenGraph("<html><head><title>Cool Page</title></head></html>")).toEqual({
      title: "Cool Page",
    });
  });

  it("prefers og:title over <title>", () => {
    const html =
      '<html><head><title>fallback</title><meta property="og:title" content="Real Title"></head></html>';
    expect(parseOpenGraph(html).title).toBe("Real Title");
  });

  it("extracts og:description and og:image", () => {
    const html = `<html><head>
      <meta property="og:title" content="X">
      <meta property="og:description" content="A page about Y">
      <meta property="og:image" content="https://example.com/cover.jpg">
    </head></html>`;
    expect(parseOpenGraph(html)).toEqual({
      title: "X",
      description: "A page about Y",
      image: "https://example.com/cover.jpg",
    });
  });

  it("falls back to meta description if og:description missing", () => {
    const html = `<html><head>
      <meta name="description" content="Plain old description">
      <meta property="og:title" content="X">
    </head></html>`;
    expect(parseOpenGraph(html).description).toBe("Plain old description");
  });

  it("decodes HTML entities", () => {
    const html = `<html><head>
      <meta property="og:title" content="Tom &amp; Jerry's &quot;Show&quot;">
    </head></html>`;
    expect(parseOpenGraph(html).title).toBe(`Tom & Jerry's "Show"`);
  });

  it("handles single-quoted and unquoted attributes", () => {
    const html = `<html><head>
      <meta property='og:title' content='Single Quotes'>
      <meta property=og:description content=unquoted>
    </head></html>`;
    const og = parseOpenGraph(html);
    expect(og.title).toBe("Single Quotes");
    expect(og.description).toBe("unquoted");
  });
});
