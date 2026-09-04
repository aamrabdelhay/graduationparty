/**
 * Optional visual person/head check (used before AI processing when
 * AI_VISION_CHECK=true). Calls an OpenAI vision-capable model; failures never
 * block uploads.
 */
import { getAiApiKey } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { ImageKind } from "@/db/schema";

export interface PersonCheckResult {
  ok: boolean;
  code?: string;
  message?: string;
}

const VISION_MODEL = process.env.AI_VISION_MODEL ?? "gpt-4o-mini";

export async function checkPersonPresence(kind: ImageKind, buffer: Buffer): Promise<PersonCheckResult> {
  const key = getAiApiKey();
  if (!key) return { ok: true };
  try {
    const kindLabel = kind === "CHILDHOOD" ? "childhood" : "adult";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model: VISION_MODEL,
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `This is a ${kindLabel} photo uploaded by a graduation-event attendee. Decide whether the photo clearly contains a recognizable person with a head/face that a graduation cap could be placed on. If yes respond with JSON {"ok":true}. If the image is definitely unsuitable (no person at all, empty scenery, cartoon without a face, text/artwork, heavily obscured face), respond with JSON {"ok":false,"reason":"<short reason>"}. Be tolerant of angles, lighting and non-perfect portraits.`,
              },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${buffer.toString("base64")}` },
              },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      logger.warn("person check http failed", { status: res.status });
      return { ok: true };
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    const parsed = match ? (JSON.parse(match[0]) as { ok?: boolean; reason?: string }) : null;
    if (parsed?.ok === false) {
      return {
        ok: false,
        code: "NO_PERSON",
        message:
          "No suitable person/head was detected in this image. Please upload a clear photo of yourself.",
      };
    }
    return { ok: true };
  } catch (err) {
    logger.warn("person check failed (ignored)", { error: (err as Error).message });
    return { ok: true };
  }
}
