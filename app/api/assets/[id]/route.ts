import { eq, and } from "drizzle-orm";
import { getAsset } from "@/lib/assets";
import { getDb } from "@/db";
import { imageAsset, adminDraft, adminDraftChange } from "@/db/schema";
import { getAdminSession } from "@/lib/auth/admin";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Remove a staged (uncommitted) asset — used when a user replaces/regenerates
 * a photo before submission, or discards an admin image replacement.
 * Committed assets can never be deleted through this route.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const asset = await getAsset(id);
  if (!asset) return jsonError("Image not found.", 404, "NOT_FOUND");
  if (asset.committed) {
    return jsonError("Committed images are managed through the draft system.", 403, "COMMITTED");
  }

  // Guard: if an OPEN admin draft of this session references the staged asset
  // as the new value of an image change, deletion would break the pending save.
  const session = await getAdminSession();
  if (session) {
    const drafts = await getDb()
      .select({ id: adminDraft.id })
      .from(adminDraft)
      .where(and(eq(adminDraft.sessionId, session.id), eq(adminDraft.status, "OPEN")));
    for (const draft of drafts) {
      const refs = await getDb()
        .select({ id: adminDraftChange.id, newValue: adminDraftChange.newValue })
        .from(adminDraftChange)
        .where(eq(adminDraftChange.draftId, draft.id));
      if (refs.some((r) => JSON.stringify(r.newValue) === JSON.stringify(id))) {
        return jsonError(
          "This image is part of your unsaved changes. Discard the changes first if you want to remove it.",
          409,
          "IN_DRAFT",
        );
      }
    }
  }

  const { deleteStoredObject } = await import("@/lib/storage");
  await deleteStoredObject(asset.storageKey, asset.storageProvider).catch(() => undefined);
  await getDb().delete(imageAsset).where(eq(imageAsset.id, asset.id));
  return jsonOk({ deleted: true });
}
