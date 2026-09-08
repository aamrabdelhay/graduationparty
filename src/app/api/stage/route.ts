import { NextRequest } from "next/server";
import {
  generateGraduationImage,
  normalizeImage,
  storeImage,
  validateImage,
} from "@/lib/media";

export const runtime = "nodejs";
// AI image processing can take a while with an external provider.
export const maxDuration = 60;

/**
 * Public staging endpoint (participant flow + admin replace flow).
 * Validates -> normalizes -> stores original. For adult photos it also runs
 * the AI graduation-cap pipeline and stores a separate generated asset.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const kind = form.get("kind") === "adult" ? "adult" : "childhood";

    if (!(file instanceof File)) {
      return Response.json({ ok: false, error: "لم يتم إرفاق صورة" }, { status: 400 });
    }
    const problem = validateImage({ type: file.type, size: file.size });
    if (problem) {
      return Response.json({ ok: false, error: problem }, { status: 400 });
    }

    const raw = Buffer.from(await file.arrayBuffer());
    const normalized = await normalizeImage(raw);
    const originalUrl = await storeImage(normalized, "staging");

    let graduationUrl: string | null = null;
    let gradStatus: "READY" | "FAILED" | null = null;
    let gradError: string | null = null;

    if (kind === "adult") {
      try {
        const generated = await generateGraduationImage(normalized);
        graduationUrl = await storeImage(generated, "staging");
        gradStatus = "READY";
      } catch (e) {
        gradStatus = "FAILED";
        gradError = e instanceof Error ? e.message : "فشل توليد صورة التخرج";
        // Never block submission: original image stays usable.
      }
    }

    return Response.json({ ok: true, originalUrl, graduationUrl, gradStatus, gradError });
  } catch (e) {
    console.error("stage error", e);
    return Response.json(
      { ok: false, error: "حدث خطأ أثناء تجهيز الصورة" },
      { status: 500 },
    );
  }
}
