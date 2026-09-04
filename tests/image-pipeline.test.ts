import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { inspectImage, normalizeImage, resolutionChecks, ImageValidationError } from "@/lib/images/pipeline";

async function makeJpeg(width = 800, height = 1000): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 190, g: 170, b: 140 } },
  })
    .jpeg({ quality: 85 })
    .toBuffer();
}

describe("image pipeline", () => {
  it("inspects a valid jpeg", async () => {
    const buffer = await makeJpeg();
    const info = await inspectImage(buffer);
    expect(info.mimeType).toBe("image/jpeg");
    expect(info.extension).toBe("jpg");
    expect(info.width).toBe(800);
    expect(info.height).toBe(1000);
  });

  it("rejects garbage bytes as corrupted", async () => {
    await expect(inspectImage(Buffer.from("not an image at all"))).rejects.toBeInstanceOf(ImageValidationError);
  });

  it("rejects unsupported formats (gif)", async () => {
    const gif = sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } })
      .gif()
      .toBuffer();
    await expect(inspectImage(await gif)).rejects.toBeInstanceOf(ImageValidationError);
  });

  it("detects low resolution", () => {
    expect(resolutionChecks(100, 100).ok).toBe(false);
    expect(resolutionChecks(1200, 900).ok).toBe(true);
  });

  it("normalizes while preserving format & orientation", async () => {
    const buffer = await makeJpeg(1600, 1200);
    const info = await inspectImage(buffer);
    const out = await normalizeImage(info);
    expect(out.extension).toBe("jpg");
    const meta = await sharp(out.buffer).metadata();
    expect(meta.width).toBeGreaterThan(0);
  });
});
