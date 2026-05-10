/**
 * Image upload helpers. Bluesky requires:
 *   1. POST com.atproto.repo.uploadBlob with the raw bytes — returns a blob ref
 *   2. Reference that blob in app.bsky.embed.images on a post record
 *   3. Each image needs an `alt` field (community norm; not server-enforced)
 *
 * Constraints (from AT Proto / Bluesky):
 *   - Up to 4 images per post
 *   - Each image <= 1,000,000 bytes (1 MB)
 *   - Supported MIME: image/jpeg, image/png, image/webp, image/gif
 */
import type { AtpAgent, BlobRef } from "@atproto/api";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

export const MAX_IMAGES_PER_POST = 4;
export const MAX_IMAGE_BYTES = 1_000_000;

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

const ALLOWED_MIME = new Set(Object.values(MIME_BY_EXT));

export type ImageInput =
  | { kind: "url"; url: string; alt?: string }
  | { kind: "path"; path: string; alt?: string }
  | { kind: "buffer"; data: Buffer; mimeType: string; alt?: string };

export type UploadedImage = {
  blob: BlobRef;
  alt: string;
  aspectRatio?: { width: number; height: number };
};

function inferMimeType(pathOrUrl: string): string {
  const ext = extname(pathOrUrl.split("?")[0] ?? "").toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) throw new Error(`bluesky: unsupported image extension "${ext}"`);
  return mime;
}

async function loadImage(input: ImageInput): Promise<{ data: Uint8Array; mimeType: string }> {
  if (input.kind === "buffer") {
    if (!ALLOWED_MIME.has(input.mimeType)) {
      throw new Error(`bluesky: unsupported MIME "${input.mimeType}"`);
    }
    return { data: input.data, mimeType: input.mimeType };
  }
  if (input.kind === "path") {
    const data = await readFile(input.path);
    return { data, mimeType: inferMimeType(input.path) };
  }
  // url
  const res = await fetch(input.url);
  if (!res.ok) {
    throw new Error(`bluesky: failed to fetch ${input.url}: ${res.status} ${res.statusText}`);
  }
  const headerMime = res.headers.get("content-type")?.split(";")[0]?.trim();
  const mimeType = headerMime && ALLOWED_MIME.has(headerMime)
    ? headerMime
    : inferMimeType(input.url);
  const data = new Uint8Array(await res.arrayBuffer());
  return { data, mimeType };
}

export async function uploadImage(
  agent: AtpAgent,
  input: ImageInput,
): Promise<UploadedImage> {
  const { data, mimeType } = await loadImage(input);
  if (data.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(
      `bluesky: image is ${data.byteLength} bytes; Bluesky limit is ${MAX_IMAGE_BYTES} (1 MB)`,
    );
  }
  const res = await agent.uploadBlob(data, { encoding: mimeType });
  return {
    blob: res.data.blob,
    alt: input.alt ?? "",
  };
}

export async function uploadImages(
  agent: AtpAgent,
  inputs: ImageInput[],
): Promise<UploadedImage[]> {
  if (inputs.length === 0) return [];
  if (inputs.length > MAX_IMAGES_PER_POST) {
    throw new Error(
      `bluesky: ${inputs.length} images; Bluesky limit is ${MAX_IMAGES_PER_POST} per post`,
    );
  }
  // Sequential — Bluesky rate-limits blob upload per-account; parallel risks 429.
  const out: UploadedImage[] = [];
  for (const input of inputs) {
    out.push(await uploadImage(agent, input));
  }
  return out;
}

export function buildImagesEmbed(images: UploadedImage[]): {
  $type: "app.bsky.embed.images";
  images: Array<{ image: BlobRef; alt: string; aspectRatio?: { width: number; height: number } }>;
} {
  return {
    $type: "app.bsky.embed.images",
    images: images.map((i) => ({
      image: i.blob,
      alt: i.alt,
      ...(i.aspectRatio ? { aspectRatio: i.aspectRatio } : {}),
    })),
  };
}
