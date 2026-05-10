/**
 * Rich-text facet extraction for Bluesky posts.
 *
 * Facets are byte-offset annotations on post text. AT Protocol uses UTF-8
 * byte offsets, not character offsets — emoji and non-ASCII break naive
 * char counts. Detects URLs, hashtags, and mentions; mention handles are
 * resolved to DIDs by the caller (since that requires an authed agent).
 *
 * Mirrors the Python implementation in ../../cli/_facets.py.
 */

const URL_TRAIL = ".,;:!?)\"']";
const URL_RE = /https?:\/\/[^\s<>]+/gi;
const TAG_RE = /(?:^|\s)(#[^\s#]*[A-Za-z][^\s#]*)/g;
const MENTION_RE =
  /(?:^|\s)(@[a-zA-Z0-9][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9][a-zA-Z0-9-]*)+)/g;

export type FacetFeature =
  | { $type: "app.bsky.richtext.facet#link"; uri: string }
  | { $type: "app.bsky.richtext.facet#tag"; tag: string }
  | { $type: "app.bsky.richtext.facet#mention"; did: string };

export type Facet = {
  index: { byteStart: number; byteEnd: number };
  features: [FacetFeature];
};

const enc = new TextEncoder();

function byteSpan(text: string, start: number, end: number) {
  const byteStart = enc.encode(text.slice(0, start)).length;
  const byteEnd = byteStart + enc.encode(text.slice(start, end)).length;
  return { byteStart, byteEnd };
}

function trimUrl(url: string): string {
  while (url.length > 0 && URL_TRAIL.includes(url[url.length - 1]!)) {
    url = url.slice(0, -1);
  }
  if (url.endsWith(")")) {
    const opens = (url.match(/\(/g) ?? []).length;
    const closes = (url.match(/\)/g) ?? []).length;
    if (opens < closes) url = url.slice(0, -1);
  }
  return url;
}

export type MentionResolver = (handle: string) => Promise<string | null>;

/** Extract facets from `text`. Mentions are skipped if the resolver returns null. */
export async function extractFacets(
  text: string,
  resolveMention: MentionResolver,
): Promise<Facet[]> {
  const facets: Facet[] = [];

  for (const m of text.matchAll(URL_RE)) {
    const raw = m[0];
    const trimmed = trimUrl(raw);
    if (!trimmed) continue;
    const start = m.index!;
    const end = start + trimmed.length;
    facets.push({
      index: byteSpan(text, start, end),
      features: [{ $type: "app.bsky.richtext.facet#link", uri: trimmed }],
    });
  }

  for (const m of text.matchAll(TAG_RE)) {
    const tagWithHash = m[1]!;
    const tag = tagWithHash.slice(1);
    if (/^\d+$/.test(tag)) continue;
    const start = m.index! + (m[0].length - tagWithHash.length);
    const end = start + tagWithHash.length;
    facets.push({
      index: byteSpan(text, start, end),
      features: [{ $type: "app.bsky.richtext.facet#tag", tag }],
    });
  }

  for (const m of text.matchAll(MENTION_RE)) {
    const handleWithAt = m[1]!;
    const handle = handleWithAt.slice(1);
    const did = await resolveMention(handle);
    if (!did) continue;
    const start = m.index! + (m[0].length - handleWithAt.length);
    const end = start + handleWithAt.length;
    facets.push({
      index: byteSpan(text, start, end),
      features: [{ $type: "app.bsky.richtext.facet#mention", did }],
    });
  }

  return facets;
}
