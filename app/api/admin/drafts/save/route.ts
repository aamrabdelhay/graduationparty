import { requireAdmin } from "@/lib/auth/require-admin";
import { saveDraft, publishDraftApplied } from "@/lib/drafts/service";
import { jsonError, jsonOk } from "@/lib/http";
import { z } from "zod";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  keepLocal: z.array(z.string().uuid()).optional().default([]),
  keepDb: z.array(z.string().uuid()).optional().default([]),
});

/**
 * Persist all pending admin edits in a single transaction. Conflicts (other
 * sessions changed the same participant meanwhile) return 409 with details so
 * the admin can pick "keep database" or "keep my changes".
 */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return jsonError("Invalid request.", 422, "VALIDATION");
  }

  try {
    const result = await saveDraft(guard.session.id, { keepLocal: body.keepLocal, keepDb: body.keepDb });
    if (!result.saved && result.conflicts?.length) {
      return jsonOk(
        { saved: false, conflicts: result.conflicts },
        { status: 409 },
      );
    }
    if (result.queueReordered || result.deletedParticipantIds.length > 0) {
      publishDraftApplied(result.stateVersion);
    }
    return jsonOk({ ...result, saved: true });
  } catch (err) {
    const message = (err as Error).message;
    logger.error("draft save failed", { error: message });
    if (/queue changed since|missing|no longer|already attached/i.test(message)) {
      return jsonError(message, 409, "SAVE_CONFLICT");
    }
    return jsonError("Could not save changes. Please try again.", 500, "SAVE_FAILED");
  }
}
