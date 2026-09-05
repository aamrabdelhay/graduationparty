/**
 * Server-side image pipeline: Upload → Validate → Normalize → Store Original → AI.
 *
 * Validation messages are user-friendly; a "code" is also returned so the UI
 * can render the exact recommended copy.
 */
import sharp from "sharp";
import type { Metadata } from "sharp";
import { getMaxUploadBytes } from "@/lib/env";
import type { ImageKind } from "@/db/schema";

export interface ImageValidationErrorOptions {
  code: string;
  message: string;
}

export class ImageValidationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ImageValidationError";
    this.code = code;
  }
}

export const SUPPORTED_MIME = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export interface ImageInfo {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  width: number;
  height: number;
  bytes: number;
}

/** Identify + decode header info. Throws ImageValidationError for corrupt/unsupported files. */
export async function inspectImage(buffer: Buffer): Promise<ImageInfo> {
  if (!buffer || buffer.byteLength === 0) {
    throw new ImageValidationError("EMPTY", "The file appears to be empty. Please upload a valid image.");
  }
  if (buffer.byteLength > getMaxUploadBytes()) {
    throw new ImageValidationError("TOO_LARGE", "The image is larger than 10 MB. Please upload a smaller image.");
  }
  let meta: Metadata;
  try {
    meta = await sharp(buffer, { failOn: "error", limitInputPixels: 80_000_000 }).metadata();
  } catch {
    throw new ImageValidationError("CORRUPT", "This file is corrupted or is not a valid image. Please upload a clear JPG, PNG or WebP photo.");
  }
  const format = meta.format ?? "";
  const extension = format === "jpeg" ? "jpg" : format === "png" ? "png" : format === "webp" ? "webp" : undefined;
  if (!extension) {
    throw new ImageValidationError("UNSUPPORTED_FORMAT", "Unsupported file format. Please upload a JPG, PNG or WebP image.");
  }
  const mimeType = format === "jpeg" ? "image/jpeg" : `image/${format}`;
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 1 || height < 1) {
    throw new ImageValidationError("INVALID_DIMENSIONS", "The image has invalid dimensions. Please choose another photo.");
  }
  return { buffer, mimeType, extension, width, height, bytes: buffer.byteLength };
}

export const MIN_IMAGE_DIMENSION = 320;

export interface QualityCheck {
  ok: boolean;
  code?: string;
  message?: string;
}

/**
 * Photos are accepted even when smaller than the presentation target. The
 * normalizer safely upscales the short edge to the minimum output size so a
 * low-resolution phone/memory photo no longer blocks the guest flow.
 */
export function resolutionChecks(width: number, height: number): QualityCheck {
  if (width < 1 || height < 1) {
    return { ok: false, code: "INVALID_DIMENSIONS", message: "The image has invalid dimensions. Please choose another photo." };
  }
  return { ok: true };
}

/**
 * Person/head suitability check.
 * A real visual model is used only when explicitly enabled. Detection failures
 * never block an otherwise valid upload.
 */
export async function personCheck(kind: ImageKind, buffer: Buffer): Promise<QualityCheck> {
  if (process.env.AI_VISION_CHECK !== "true") return { ok: true };
  const { checkPersonPresence } = await import("@/lib/ai/person-check");
  try {
    return await checkPersonPresence(kind, buffer);
  } catch {
    return { ok: true };
  }
}

export interface NormalizedImage {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  width: number;
  height: number;
}

/** Auto-rotate, normalize and guarantee at least 320px on each output edge. */
export async function normalizeImage(info: ImageInfo): Promise<NormalizedImage> {
  const MAX_EDGE = 2000;
  let pipeline = sharp(info.buffer, { failOn: "none" }).rotate();
  const longest = Math.max(info.width, info.height);
  const shortest = Math.min(info.width, info.height);

  if (longest > MAX_EDGE) {
    const scale = MAX_EDGE / longest;
    pipeline = pipeline.resize({
      width: Math.max(1, Math.round(info.width * scale)),
      height: Math.max(1, Math.round(info.height * scale)),
      fit: "inside",
      withoutEnlargement: true,
    });
  } else if (shortest < MIN_IMAGE_DIMENSION) {
    const scale = MIN_IMAGE_DIMENSION / shortest;
    pipeline = pipeline.resize({
      width: Math.max(MIN_IMAGE_DIMENSION, Math.round(info.width * scale)),
      height: Math.max(MIN_IMAGE_DIMENSION, Math.round(info.height * scale)),
      fit: "inside",
      withoutEnlargement: false,
    });
  }

  let buffer: Buffer;
  if (info.mimeType === "image/png") {
    buffer = await pipeline.png({ compressionLevel: 8, palette: false }).toBuffer();
  } else if (info.mimeType === "image/webp") {
    buffer = await pipeline.webp({ quality: 88 }).toBuffer();
  } else {
    buffer = await pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  }
  const meta = await sharp(buffer).metadata();
  return {
    buffer,
    mimeType: info.mimeType,
    extension: info.extension,
    width: meta.width ?? info.width,
    height: meta.height ?? info.height,
  };
}
