/**
 * Shared server-side upload handling:
 *   file bytes → inspect (format/size/corruption) → quality check
 *   → person check (optional) → normalize → store object → ImageAsset row.
 */
import { createImageAsset } from "@/lib/assets";
import { inspectImage, normalizeImage, resolutionChecks, personCheck, ImageValidationError } from "@/lib/images/pipeline";
import type { ImageAssetRow, ImageKind } from "@/db/schema";
import { getMaxUploadBytes } from "@/lib/env";

export interface UploadResult {
  asset: ImageAssetRow;
  width: number;
  height: number;
}

export async function handleImageUpload(opts: {
  kind: ImageKind;
  bytes: Uint8Array;
  committed?: boolean;
  participantId?: string | null;
}): Promise<UploadResult> {
  const buffer = Buffer.from(opts.bytes);
  if (buffer.byteLength === 0) {
    throw new ImageValidationError("EMPTY", "The file appears to be empty. Please upload a valid image.");
  }
  const max = getMaxUploadBytes();
  if (buffer.byteLength > max) {
    throw new ImageValidationError(
      "TOO_LARGE",
      `The image is larger than ${Math.round(max / (1024 * 1024))} MB. Please upload a smaller image.`,
    );
  }
  const info = await inspectImage(buffer);
  const resolution = resolutionChecks(info.width, info.height);
  if (!resolution.ok) {
    throw new ImageValidationError(resolution.code ?? "INVALID", resolution.message ?? "Please upload a clearer image.");
  }
  await personCheck(opts.kind, info.buffer);
  const normalized = await normalizeImage(info);
  const asset = await createImageAsset({
    kind: opts.kind,
    buffer: normalized.buffer,
    mimeType: normalized.mimeType,
    extension: normalized.extension,
    width: normalized.width,
    height: normalized.height,
    committed: opts.committed ?? false,
    participantId: opts.participantId ?? null,
  });
  return { asset, width: normalized.width, height: normalized.height };
}
