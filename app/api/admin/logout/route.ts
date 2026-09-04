import { getAdminSession, logoutSessionById, clearSessionCookie } from "@/lib/auth/admin";
import { hasOpenChanges, discardOpenDraft, getOpenDraftSummary } from "@/lib/drafts/service";
import { jsonError, jsonOk } from "@/lib/http";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin logout. When the admin still has unsaved changes the client MUST pass
 * discardUnsaved=true (after showing the confirmation modal); the server then
 * discards the draft and stores a reminder for the next login.
 */
export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) return jsonOk({ ok: true });

  let discardUnsaved = false;
  try {
    const body = (await req.json()) as { discardUnsaved?: boolean };
    discardUnsaved = body.discardUnsaved === true;
  } catch {
    /* body optional */
  }

  const summary = await getOpenDraftSummary(session.id);
  if (summary.changeCount > 0 && !discardUnsaved) {
    return jsonError(
      "You have unsaved changes. Save them or confirm discarding them before logging out.",
      409,
      "UNSAVED_CHANGES",
      { unsavedCount: summary.changeCount },
    );
  }
  if (discardUnsaved && summary.changeCount > 0) {
    await discardOpenDraft(session.id, { notifyDiscarded: true });
    await hasOpenChanges(session.id);
  }
  await logoutSessionById(session.id);
  await clearSessionCookie();
  await logActivity({ action: "admin_logout", adminSessionId: session.id });
  return jsonOk({ ok: true });
}
