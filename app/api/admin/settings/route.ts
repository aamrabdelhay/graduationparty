import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ensurePresentationState, settingsFromState } from "@/lib/presentation/state";
import { addDraftChange, getOpenDraftSummary } from "@/lib/drafts/service";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_KEYS = new Set([
  "settings.childhoodDurationMs",
  "settings.smokeDurationMs",
  "settings.adultDurationMs",
  "settings.nameRevealDurationMs",
  "settings.transitionDurationMs",
  "settings.mode",
  "settings.autoPlay",
  "settings.loopAfterQueueEnd",
  "settings.displaySettings",
]);

const changeSchema = z.object({
  field: z.string(),
  newValue: z.unknown(),
});
const bodySchema = z.object({ changes: z.array(changeSchema).min(1).max(30) });

/** GET — current settings state (for the settings page). */
export async function GET() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const state = await ensurePresentationState();
  const summary = await getOpenDraftSummary(guard.session.id);
  return jsonOk({
    settings: settingsFromState(state),
    draft: { changeCount: summary.changeCount, draftId: summary.draftId },
  });
}

/**
 * POST — record settings edits through the unsaved-changes system.
 * Nothing is applied to the live presentation until "Save changes".
 */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return jsonError("Invalid settings payload.", 422, "VALIDATION");
  }
  try {
    for (const c of body.changes) {
      if (!ALLOWED_KEYS.has(c.field)) {
        return jsonError(`Unknown setting "${c.field}".`, 422, "VALIDATION");
      }
      await addDraftChange(guard.session.id, { field: c.field, newValue: c.newValue });
    }
    const summary = await getOpenDraftSummary(guard.session.id);
    return jsonOk({ ok: true, changeCount: summary.changeCount });
  } catch (err) {
    return jsonError((err as Error).message ?? "Could not save changes.", 400, "BAD_CHANGE");
  }
}
