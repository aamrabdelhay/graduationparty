/**
 * Shared multipart upload handler for public and admin upload endpoints.
 * Public callers may upload CHILDHOOD / ADULT only; admins may also upload a
 * replacement GRADUATION image.
 */
import { handleImageUpload } from "@/lib/server/upload";
import { jsonError, jsonOk } from "@/lib/http";
import { createSlidingWindowLimiter } from "@/lib/rate-limit-memory";
import { clientIpFromHeaders } from "@/lib/auth/rate-limit";
import type { ImageKind } from "@/db/schema";
import { logger } from "@/lib/logger";

export const publicUploadLimiter = createSlidingWindowLimiter(60 * 60 * 1000, 40);

export async function handleUploadRequest(req: Request, opts: { allowGraduation: boolean }) {
  const ip = clientIpFromHeaders(req.headers);
  const rate = publicUploadLimiter.check(ip);
  if (!rate.allowed) {
    return jsonError("Too many uploads. Please try again later.", 429, "RATE_LIMITED");
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("Image upload failed. Please try again.", 400, "UPLOAD_FAILED");
  }
  const file = form.get("file");
  const kindRaw = String(form.get("kind") ?? "");
  if (!(file instanceof File)) {
    return jsonError("No image was attached. Please choose a photo.", 400, "NO_FILE");
  }
  if (file.size === 0) {
    return jsonError("The file appears to be empty. Please upload a valid image.", 422, "EMPTY");
  }
  const kind = (kindRaw.toUpperCase() === "CHILDHOOD" || kindRaw.toUpperCase() === "ADULT" || kindRaw.toUpperCase() === "GRADUATION"
    ? kindRaw.toUpperCase()
    : "") as ImageKind;
  if (!kind) {
    return jsonError("Missing image kind.", 400, "INVALID_KIND");
  }
  if (kind === "GRADUATION" && !opts.allowGraduation) {
    return jsonError("You cannot upload a graduation image here.", 403, "FORBIDDEN");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const result = await handleImageUpload({ kind, bytes });
    return jsonOk({
      asset: {
        id: result.asset.id,
        kind: result.asset.kind,
        url: result.asset.publicUrl,
        width: result.asset.width,
        height: result.asset.height,
        mimeType: result.asset.mimeType,
      },
    });
  } catch (err) {
    const e = err as { name?: string; code?: string; message?: string; stack?: string };
    if (e?.name === "ImageValidationError") {
      return jsonError(e.message ?? "Please upload a valid image.", 422, e.code);
    }
    logger.error("image_upload_failed", {
      name: e?.name ?? "Error",
      code: e?.code ?? null,
      message: e?.message ?? String(err),
      stack: e?.stack?.slice(0, 2000) ?? null,
    });
    return jsonError("Image upload failed. Please try again.", 500, "UPLOAD_FAILED");
  }
}
