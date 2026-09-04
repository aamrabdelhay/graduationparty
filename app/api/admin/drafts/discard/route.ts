import { requireAdmin } from "@/lib/auth/require-admin";
import { discardOpenDraft } from "@/lib/drafts/service";
import { jsonOk } from "@/lib/http";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Discard all pending unsaved changes for this session (staged images deleted). */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  let notifyDiscarded = false;
  try {
    const body = (await req.json()) as { notifyDiscarded?: boolean };
    notifyDiscarded = body.notifyDiscarded === true;
  } catch {
    /* optional body */
  }
  const result = await discardOpenDraft(guard.session.id, { notifyDiscarded });
  if (notifyDiscarded && result.discarded > 0) {
    await logActivity({ action: "draft_discarded", adminSessionId: guard.session.id, metadata: { count: result.discarded } });
  }
  return jsonOk({ ok: true, discarded: result.discarded });
}
