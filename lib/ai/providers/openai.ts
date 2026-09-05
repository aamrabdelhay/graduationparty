/** OpenAI image-edit provider for realistic graduation-cap edits. */
import sharp from "sharp";
import { getAiApiKey, getAiImageSize, getAiModel } from "@/lib/env";
import { getStorage } from "@/lib/storage";
import { logger } from "@/lib/logger";
import { buildCapPrompt } from "@/lib/ai/prompt";
import { CapGenerationError, type CapGenerationResult, type CapGenerator, type CapGenerationInput } from "@/lib/ai/types";

const API_URL = "https://api.openai.com/v1/images/edits";

function extensionFromMimeType(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg": return "jpg";
    case "image/webp": return "webp";
    case "image/gif": return "gif";
    case "image/avif": return "avif";
    default: return "png";
  }
}

export class OpenAIProvider implements CapGenerator {
  readonly providerName = "openai";
  constructor() {
    if (!getAiApiKey()) throw new Error("AI provider 'openai' requires AI_API_KEY.");
  }

  async generate(input: CapGenerationInput): Promise<CapGenerationResult> {
    const key = getAiApiKey();
    const model = getAiModel() || "gpt-image-2";
    const size = getAiImageSize();
    const prompt = buildCapPrompt(input.adultAsset);

    let original: Buffer;
    try {
      original = await getStorage().get(input.adultAsset.storageKey);
    } catch (err) {
      throw new CapGenerationError("Could not read the original adult photo. Please upload it again.", { cause: err });
    }

    // Keep the input compact so the edit request starts quickly while preserving
    // enough resolution for a clean face/cap edit. The original asset remains untouched.
    let editBuffer: Buffer;
    try {
      editBuffer = await sharp(original)
        .rotate()
        .resize({ width: 1536, height: 1536, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer();
    } catch (err) {
      throw new CapGenerationError("تعذر تجهيز صورة التخرج للذكاء الاصطناعي.", { cause: err });
    }

    const form = new FormData();
    form.append("model", model);
    form.append("prompt", prompt);
    form.append("size", size);
    // Medium is the best speed/quality balance for a live graduation workflow.
    form.append("quality", process.env.AI_QUALITY || "medium");
    form.append("output_format", "png");
    form.append("n", "1");
    form.append("image[]", new Blob([new Uint8Array(editBuffer)], { type: "image/jpeg" }), "adult-photo.jpg");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    let res: Response;
    try {
      res = await fetch(API_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) throw new CapGenerationError("خدمة إنشاء الصورة استغرقت وقتًا أطول من المتوقع. سيتم استخدام البديل السريع.", { cause: err });
      throw new CapGenerationError("تعذر الوصول إلى خدمة إنشاء الصورة. سيتم استخدام البديل السريع.", { cause: err });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      let detail = "";
      let code = "";
      try {
        const body = (await res.json()) as { error?: { message?: string; code?: string; type?: string } };
        detail = body.error?.message ?? "";
        code = body.error?.code ?? body.error?.type ?? "";
      } catch {}
      logger.error("openai cap generation failed", { status: res.status, code, detail: detail.slice(0, 300) });
      const message = res.status === 401
        ? "فشل التحقق من خدمة الذكاء الاصطناعي. راجع مفتاح الخدمة."
        : res.status === 429
          ? "خدمة الذكاء الاصطناعي مشغولة حاليًا. سيتم استخدام البديل السريع."
          : detail
            ? `فشل إنشاء صورة التخرج: ${detail.slice(0, 220)}`
            : "فشل إنشاء صورة التخرج. سيتم استخدام البديل السريع.";
      throw new CapGenerationError(message);
    }

    const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new CapGenerationError("لم تُرجع خدمة الذكاء الاصطناعي صورة. سيتم استخدام البديل السريع.");
    return { buffer: Buffer.from(b64, "base64"), mimeType: "image/png", extension: "png", provider: this.providerName };
  }
}
