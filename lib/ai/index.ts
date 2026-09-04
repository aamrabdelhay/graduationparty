/**
 * AI facade: choose provider from config, run generation, store result.
 *
 * Pipeline used everywhere:
 *   Upload → Validate → Normalize → Store Original → AI Processing → Store Generated Image
 */
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
  const provider = getAiProvider();
  if (provider === "openai") {
    cachedGenerator = new OpenAIProvider();
  } else {
    cachedGenerator = new OfflineCapGenerator();
  }
  return cachedGenerator;
}

export interface GenerateCapResult {
  /** New graduation ImageAsset (committed=false unless attach=true). */
  asset: ImageAssetRow;
  provider: string;
}

export interface GenerateCapOptions {
  adultAsset: ImageAssetRow;
  committed?: boolean;
  participantId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Run cap generation for a stored adult photo and store the generated asset. */
export async function generateAndStoreGraduationImage(opts: GenerateCapOptions): Promise<GenerateCapResult> {
  const generator = getCapGenerator();
  const result = await generator.generate({
    adultAsset: opts.adultAsset,
    adultImageUrl: opts.adultAsset.publicUrl,
  });
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
    metadata: { provider: result.provider, ...(opts.metadata ?? {}) },
  });
  logger.info("ai cap generated", { assetId: asset.id, provider: result.provider, width: meta.width, height: meta.height });
  return { asset, provider: result.provider };
}
