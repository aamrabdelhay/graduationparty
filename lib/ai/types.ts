/**
 * AI graduation-cap generation abstraction.
 *
 * The application only depends on the `CapGenerator` interface; concrete
 * providers are chosen from environment configuration, so the AI vendor can be
 * swapped without touching the submission/queue/admin flows.
 */

import type { ImageAssetRow } from "@/db/schema";

export interface CapGenerationInput {
  /** Adult/original photo asset (already stored). */
  adultAsset: ImageAssetRow;
  /** Optional public URL used when the provider needs an http(s) input. */
  adultImageUrl: string;
  /** Seed/model hint for deterministic tests. */
  promptExtra?: string;
}

export interface CapGenerationResult {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  /** Provider name recorded for logs. */
  provider: string;
}

export interface CapGenerator {
  readonly providerName: string;
  generate(input: CapGenerationInput): Promise<CapGenerationResult>;
}

export class CapGenerationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CapGenerationError";
  }
}
