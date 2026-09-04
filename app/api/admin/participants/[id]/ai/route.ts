import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getDb } from "@/db";
import { participant } from "@/db/schema";
import { generateAndStoreGraduationImage } from "@/lib/ai";
import { addDraftChange, getOpenDraftSummary } from "@/lib/drafts/service";
import { jsonError, jsonOk } from "@/lib/http";
import { logActivity } from "@/lib/activity";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin "Retry AI generation": runs cap generation on the participant's adult
 * photo. The result is staged as an unsaved replacement of the graduation
 * image — it only lands after the admin saves (draft system), while the old
 * graduation/adult images remain untouched until then. Failure marks the
 * participant aiStatus=FAILED (with a friendly message) and never removes the
 * original adult photo.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return jsonError("Invalid participant id.", 400);

  const db = getDb();
  const rows = await db.select().from(participant).where(eq(participant.id, id)).limit(1);
  const row = rows[0];
  if (!row) return jsonError("Participant not found.", 404, "NOT_FOUND");
  if (!row.adultImageId) return jsonError("This participant has no adult photo.", 409, "NO_ADULT");

  const { getAsset } = await import("@/lib/assets");
  const adult = await getAsset(row.adultImageId);
  if (!adult) return jsonError("The adult photo is missing.", 409, "NO_ADULT");

  await db.update(participant).set({ aiStatus: "PROCESSING", aiError: null, updatedAt: new Date() }).where(eq(participant.id, id));

  try {
    const { asset } = await generateAndStoreGraduationImage({
      adultAsset: adult,
      committed: false,
      metadata: { context: "admin-regenerate", attempt: (row.aiRetryCount ?? 0) + 1 },
    });

    // Record as unsaved change (staged asset → applied on save).
    await addDraftChange(guard.session.id, {
      participantId: id,
      field: "graduationImageId",
      newValue: asset.id,
    });
    await db
      .update(participant)
      .set({ aiRetryCount: (row.aiRetryCount ?? 0) + 1, aiError: null, updatedAt: new Date() })
      .where(eq(participant.id, id));
    await logActivity({
      action: "ai_regenerate",
      participantId: id,
      adminSessionId: guard.session.id,
      metadata: { stagedAssetId: asset.id },
    });
    const summary = await getOpenDraftSummary(guard.session.id);
    return jsonOk({
      ok: true,
      stagedAsset: { id: asset.id, url: asset.publicUrl },
      changeCount: summary.changeCount,
      note: "The new graduation photo is staged. Save your changes to apply it.",
    });
  } catch (err) {
    const message = (err as Error).message?.includes("AI service") || (err as Error).name === "CapGenerationError"
      ? (err as Error).message
      : "Graduation cap generation failed. You can retry.";
    await db
      .update(participant)
      .set({ aiStatus: "FAILED", aiError: message, aiRetryCount: (row.aiRetryCount ?? 0) + 1, updatedAt: new Date() })
      .where(eq(participant.id, id));
    logger.error("admin ai regenerate failed", { participantId: id, error: (err as Error).message });
    return jsonError(message, 502, "AI_FAILED");
  }
}
