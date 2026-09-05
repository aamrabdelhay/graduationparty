/**
 * OpenAI Images provider for editing an adult photo into a graduation photo.
 * Uses the Images Edits endpoint because the source photograph is an input image.
 */
import { getAiApiKey, getAiImageSize, getAiModel } from "@/lib/env";
import { getStorage } from "@/lib/storage";
import { logger } from "@/lib/logger";
import { buildCapPrompt } from "@/lib/ai/prompt";
import { CapGenerationError, type CapGenerationResult, type CapGenerator, type CapGenerationInput } from "@/lib/ai/types";

const API_URL = "https://api.openai.com/v1/images/edits";

export class OpenAIProvider implements CapGenerator {
  readonly providerName = "openai";

  constructor() {
    if (!getAiApiKey()) throw new Error("AI provider 'openai' requires AI_API_KEY.");
  }

  async generate(input: CapGenerationInput): Promise<CapGenerationResult> {
    const key = getAiApiKey();
    const model = getAiModel() || "gpt-image-1";
    const size = getAiImageSize();
    const prompt = buildCapPrompt(input.adultAsset);

    let original: Buffer;
    try {
      original = await getStorage().get(input.adultAsset.storageKey);
    } catch (err) {
      throw new CapGenerationError("Could not read the original adult photo. Please upload it again.", { cause: err });
    }

    const form = new FormData();
    form.append("model", model);
    form.append("prompt", prompt);
    form.append("size", size);
    form.append("quality", process.env.AI_QUALITY ?? "medium");
    form.append("output_format", "png");
    form.append("input_fidelity", "high");
    form.append("n", "1");
    form.append("image", new Blob([new Uint8Array(original)], { type: input.adultAsset.mimeType }), "adult-photo.${input.adultAsset.extension}");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    let res: Response;
    try {
      res = await fetch(API_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) throw new CapGenerationError("The AI service timed out. Please retry.", { cause: err });
      throw new CapGenerationError("Could not reach the AI image service. Please retry.", { cause: err });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      let detail = "";
      try {
        const json = (await res.json()) as { error?: { message?: string } };
        detail = json.error?.message ?? "";
      } catch {
        /* ignore malformed error bodies */
      }
      logger.error("openai cap generation failed", { status: res.status, detail: detail.slice(0, 300) });
      const message =
        res.status === 401
          ? "فشل التحقق من خدمة الذكاء الاصطناعي. راجع مفتاح AI_API_KEY."
          : res.status === 429
            ? "خدمة الذكاء الاصطناعي مشغولة حاليًا. حاول مرة أخرى بعد قليل."
            : detail
              ? `فشل إنشاء صورة التخرج: ${detail.slice(0, 220)}`
              : "فشل إنشاء صورة التخرج. حاول مرة أخرى.";
      throw new CapGenerationError(message);
    }

    const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new CapGenerationError("لم تُرجع خدمة الذكاء الاصطناعي صورة. حاول مرة أخرى.");

    return {
      buffer: Buffer.from(b64, "base64"),
      mimeType: "image/png",
      extension: "png",
      provider: this.providerName,
    };
  }
}
