import { describe, expect, it } from "vitest";

import { MAX_IMAGE_BYTES, MAX_IMAGES_PER_POST, uploadImage, uploadImages } from "../src/media.js";

// AtpAgent shape is large; we only need uploadBlob for these tests.
function fakeAgent() {
  const calls: Array<{ size: number; encoding: string }> = [];
  return {
    calls,
    uploadBlob: async (data: Uint8Array, opts: { encoding: string }) => {
      calls.push({ size: data.byteLength, encoding: opts.encoding });
      return { data: { blob: { ref: "fake-ref", mimeType: opts.encoding, size: data.byteLength } } };
    },
  };
}

describe("uploadImage", () => {
  it("rejects oversized images", async () => {
    const agent = fakeAgent();
    const big = Buffer.alloc(MAX_IMAGE_BYTES + 1);
    await expect(
      uploadImage(agent as never, { kind: "buffer", data: big, mimeType: "image/png" }),
    ).rejects.toThrow(/limit is/);
  });

  it("rejects unsupported MIME", async () => {
    const agent = fakeAgent();
    await expect(
      uploadImage(agent as never, {
        kind: "buffer",
        data: Buffer.from([0]),
        mimeType: "image/svg+xml",
      }),
    ).rejects.toThrow(/unsupported MIME/);
  });

  it("uploads with correct encoding for valid MIME", async () => {
    const agent = fakeAgent();
    const result = await uploadImage(agent as never, {
      kind: "buffer",
      data: Buffer.from([0xff, 0xd8, 0xff]),
      mimeType: "image/jpeg",
      alt: "a test",
    });
    expect(agent.calls).toHaveLength(1);
    expect(agent.calls[0]).toEqual({ size: 3, encoding: "image/jpeg" });
    expect(result.alt).toBe("a test");
  });
});

describe("uploadImages", () => {
  it("returns [] for empty input without calling upload", async () => {
    const agent = fakeAgent();
    const result = await uploadImages(agent as never, []);
    expect(result).toEqual([]);
    expect(agent.calls).toHaveLength(0);
  });

  it("rejects more than MAX_IMAGES_PER_POST", async () => {
    const agent = fakeAgent();
    const inputs = Array.from({ length: MAX_IMAGES_PER_POST + 1 }, () => ({
      kind: "buffer" as const,
      data: Buffer.from([0]),
      mimeType: "image/png",
    }));
    await expect(uploadImages(agent as never, inputs)).rejects.toThrow(/limit is 4/);
  });

  it("uploads sequentially", async () => {
    const agent = fakeAgent();
    const inputs = Array.from({ length: 3 }, () => ({
      kind: "buffer" as const,
      data: Buffer.from([0]),
      mimeType: "image/png",
    }));
    await uploadImages(agent as never, inputs);
    expect(agent.calls).toHaveLength(3);
  });
});
