/**
 * External link card builder. Fetches OpenGraph metadata from the target URL
 * and returns an `app.bsky.embed.external` record. Optionally uploads the OG
 * image as a thumbnail blob so it renders in the card.
 *
 * Failure modes are silent-ish: if the URL doesn't load or has no OG tags,
 * we still build a card with the URL as the title (caller-supplied text
 * carries the rest of the meaning). Image upload failures are swallowed
 * (the card still posts without a thumb).
 */
import type { AtpAgent } from "@atproto/api";

import { withRetry } from "./retry.js";

const FETCH_TIMEOUT_MS = 8000;
const MAX_IMAGE_BYTES = 1_000_000;

type OgTags = {
  title?: string;
  description?: string;
  image?: string;
};

const META_RE = /<meta\s+[^>]*?>/gi;
const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;

function parseAttr(tag: string, name: string): string | undefined {
  const re = new RegExp(`${name}=(?:"([^"]*)"|'([^']*)'|([^\\s>]*))`, "i");
  const m = tag.match(re);
  return m?.[1] ?? m?.[2] ?? m?.[3];
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

export function parseOpenGraph(html: string): OgTags {
  const out: OgTags = {};
  const titleMatch = html.match(TITLE_RE);
  if (titleMatch?.[1]) out.title = decodeEntities(titleMatch[1].trim());

  for (const tag of html.matchAll(META_RE)) {
    const t = tag[0];
    const property = parseAttr(t, "property") ?? parseAttr(t, "name");
    const content = parseAttr(t, "content");
    if (!property || !content) continue;
    const decoded = decodeEntities(content.trim());
    if (property === "og:title" && decoded) out.title = decoded;
    else if (property === "og:description" && decoded) out.description = decoded;
    else if (property === "og:image" && decoded) out.image = decoded;
    else if (property === "description" && !out.description && decoded) {
      out.description = decoded;
    }
  }
  return out;
}

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: ac.signal, redirect: "follow" });
  } finally {
    clearTimeout(t);
  }
}

export async function fetchOgTags(url: string): Promise<OgTags> {
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return {};
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html")) return {};
    const html = await res.text();
    return parseOpenGraph(html);
  } catch {
    return {};
  }
}

export async function fetchExternalCard(
  agent: AtpAgent,
  url: string,
): Promise<Record<string, unknown>> {
  const og = await fetchOgTags(url);
  const external: Record<string, unknown> = {
    uri: url,
    title: og.title ?? url,
    description: og.description ?? "",
  };

  if (og.image) {
    const imageUrl = new URL(og.image, url).toString();
    try {
      const res = await fetchWithTimeout(imageUrl);
      if (res.ok) {
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.byteLength <= MAX_IMAGE_BYTES) {
          const mime = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "image/jpeg";
          const upload = await withRetry(() => agent.uploadBlob(buf, { encoding: mime }));
          external.thumb = upload.data.blob;
        }
      }
    } catch {
      // image fetch/upload failures don't block the card
    }
  }

  return {
    $type: "app.bsky.embed.external",
    external,
  };
}
