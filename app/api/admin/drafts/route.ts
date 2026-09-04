import { requireAdmin } from "@/lib/auth/require-admin";
import { addDraftChange, getOpenDraftSummary } from "@/lib/drafts/service";
import { jsonError, jsonOk, handleError } from "@/lib/http";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const changeSchema = z.object({
  participantId: z.string().uuid().optional().nullable(),
  field: z.string().min(1).max(80),
  newValue: z.unknown(),
});

/** GET — current unsaved-changes summary for the session. */
export async function GET() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const summary = await getOpenDraftSummary(guard.session.id);
  return jsonOk(summary);
}

/** POST — record an unsaved change for the admin session. */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  let body: z.infer<typeof changeSchema>;
  try {
    body = changeSchema.parse(await req.json());
  } catch {
    return jsonError("Invalid change payload.", 422, "VALIDATION");
  }
  try {
    const result = await addDraftChange(guard.session.id, {
      participantId: body.participantId,
      field: body.field,
      newValue: body.newValue,
    });
    const summary = await getOpenDraftSummary(guard.session.id);
    return jsonOk({ ...result, changeCount: summary.changeCount });
  } catch (err) {
    const message = (err as Error).message;
    if (/required|must|no longer exists|already|Invalid|unknown|Wrong|missing/i.test(message)) {
      return jsonError(message, 400, "BAD_CHANGE");
    }
    return handleError(err, "Could not save changes.");
  }
}
