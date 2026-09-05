/** AI facade: choose provider, generate the edit, and persist the result. */
import sharp from "sharp";
import { getAiProvider } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createImageAsset } from "@/lib/assets";
import type { ImageAssetRow } from "@/db/schema";
import type { CapGenerator } from "./types";
import { OpenAIProvider } from "./providers/openai";
import { OfflineCapGenerator } from "./providers/offline";

let cachedGenerator: CapGenerator | null = null;

export function getCapGenerator(): CapGenerator {
  if (cachedGenerator) return cachedGenerator;
  if (getAiProvider() === "openai") {
    try {
      cachedGenerator = new OpenAIProvider();
      return cachedGenerator;
    } catch (err) {
      logger.warn("openai provider unavailable; using fast local generator", { error: err instanceof Error ? err.message : String(err) });
    }
  }
  cachedGenerator = new OfflineCapGenerator();
  return cachedGenerator;
}

export interface GenerateCapResult { asset: ImageAssetRow; provider: string }
export interface GenerateCapOptions {
  adultAsset: ImageAssetRow;
  committed?: boolean;
  participantId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function generateAndStoreGraduationImage(opts: GenerateCapOptions): Promise<GenerateCapResult> {
  let generator = getCapGenerator();
  let result;
  try {
    result = await generator.generate({ adultAsset: opts.adultAsset, adultImageUrl: opts.adultAsset.publicUrl });
  } catch (err) {
    if (generator.providerName !== "openai") throw err;
    logger.warn("openai cap generation failed; using fast local fallback", { error: err instanceof Error ? err.message : String(err) });
    generator = new OfflineCapGenerator();
    result = await generator.generate({ adultAsset: opts.adultAsset, adultImageUrl: opts.adultAsset.publicUrl });
  }

  const meta = await sharp(result.buffer).metadata();
  const asset = await createImageAsset({
    kind: "GRADUATION",
    buffer: result.buffer,
    mimeType: result.mimeType,
    extension: result.extension,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    committed: opts.committed ?? false,
    participantId: opts.participantId ?? null,
    metadata: { provider: result.provider, aiFallback: result.provider === "offline", ...(opts.metadata ?? {}) },
  });
  logger.info("ai cap generated", { assetId: asset.id, provider: result.provider, width: meta.width, height: meta.height });
  return { asset, provider: result.provider };
}
