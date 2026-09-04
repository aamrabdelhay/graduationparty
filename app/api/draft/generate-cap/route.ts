import { generateAndStoreGraduationImage } from "@/lib/ai";
import { getAsset } from "@/lib/assets";
import { jsonError, jsonOk } from "@/lib/http";
import { createSlidingWindowLimiter } from "@/lib/rate-limit-memory";
import { clientIpFromHeaders } from "@/lib/auth/rate-limit";
import { logger } from "@/lib/logger";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const aiLimiter = createSlidingWindowLimiter(15 * 60 * 1000, 8);

const bodySchema = z.object({ adultAssetId: z.string().uuid() });

/**
 * Public preview: generate the AI graduation photo for an adult draft image.
 * The result is stored as a staged GRADUATION asset (committed=false). The
 * original adult photo is never modified.
 */
export async function POST(req: Request) {
  const ip = clientIpFromHeaders(req.headers);
  const rate = aiLimiter.check(ip);
  if (!rate.allowed) {
    return jsonError("Too many requests. Please wait a moment and try again.", 429, "RATE_LIMITED");
  }
  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return jsonError("Please check the information you sent.", 422, "VALIDATION");
  }
  const adult = await getAsset(parsed.adultAssetId);
  if (!adult || adult.kind !== "ADULT") {
    return jsonError("The adult photo was not found. Please upload it again.", 404, "NOT_FOUND");
  }
  if (adult.committed) {
    return jsonError("This photo belongs to a finished submission.", 403, "COMMITTED");
  }
  try {
    const { asset } = await generateAndStoreGraduationImage({
      adultAsset: adult,
      committed: false,
      metadata: { context: "public-draft" },
    });
    return jsonOk({
      asset: {
        id: asset.id,
        kind: asset.kind,
        url: asset.publicUrl,
        width: asset.width,
        height: asset.height,
      },
    });
  } catch (err) {
    logger.warn("public cap generation failed", { error: (err as Error).message });
    return jsonError(
      "Graduation cap generation failed. You can retry.",
      502,
      "AI_FAILED",
    );
  }
}
