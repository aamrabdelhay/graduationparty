/**
 * OpenAI Images provider (`gpt-image-1`) implementing the CapGenerator
 * interface. Uses the OpenAI REST API directly (no SDK dependency).
 *
 * Environment:
 *   AI_API_KEY  — required
 *   AI_MODEL    — default gpt-image-1
 *   AI_IMAGE_SIZE / AI_QUALITY — optional tuning
 */
import { getAiApiKey, getAiImageSize, getAiModel } from "@/lib/env";
import { getStorage } from "@/lib/storage";
import { logger } from "@/lib/logger";
import { buildCapPrompt } from "@/lib/ai/prompt";
import { CapGenerationError, type CapGenerationResult, type CapGenerator, type CapGenerationInput } from "@/lib/ai/types";

const API_URL = "https://api.openai.com/v1/images/generations";

export class OpenAIProvider implements CapGenerator {
  readonly providerName = "openai";

  constructor() {
    if (!getAiApiKey()) {
      throw new Error("AI provider 'openai' requires AI_API_KEY.");
    }
  }

  async generate(input: CapGenerationInput): Promise<CapGenerationResult> {
    const key = getAiApiKey();
    const model = getAiModel();
    const size = getAiImageSize();
    const prompt = buildCapPrompt(input.adultAsset);

    const original = await getStorage().get(input.adultAsset.storageKey);
    const dataUrl = `data:${input.adultAsset.mimeType};base64,${original.toString("base64")}`;

    const body: Record<string, unknown> = {
      model,
      prompt,
      input: [{ type: "input_image", image_url: { url: dataUrl } }],
      size,
      quality: process.env.AI_QUALITY ?? "medium",
      output_format: "png",
      response_format: "b64_json",
      n: 1,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    let res: Response;
    try {
      res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (controller.signal.aborted) {
        throw new CapGenerationError("The AI service timed out. Please retry.", { cause: err });
      }
      throw new CapGenerationError("Could not reach the AI image service. Please retry.", { cause: err });
    }
    clearTimeout(timer);

    if (!res.ok) {
      let detail = "";
      try {
        const json = (await res.json()) as { error?: { message?: string } };
        detail = json.error?.message ?? "";
      } catch {
        /* ignore */
      }
      logger.error("openai cap generation failed", { status: res.status, detail: detail.slice(0, 300) });
      const message =
        res.status === 401
          ? "AI service authentication failed. Check AI_API_KEY."
          : res.status === 429
            ? "The AI service is busy right now. Please retry in a moment."
            : "Graduation cap generation failed. You can retry.";
      throw new CapGenerationError(message);
    }

    const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) {
      throw new CapGenerationError("Graduation cap generation failed. You can retry.");
    }
    const buffer = Buffer.from(b64, "base64");
    return { buffer, mimeType: "image/png", extension: "png", provider: this.providerName };
  }
}
