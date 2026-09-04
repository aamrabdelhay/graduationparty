import { requireAdmin } from "@/lib/auth/require-admin";
import { jsonOk } from "@/lib/http";
import {
  createDisplayToken,
  getActiveDisplay,
  revokeActiveDisplay,
} from "@/lib/presentation/tokens";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function linkFor(token: string) {
  const base = process.env.APP_BASE_URL ?? "";
  return `${base}/presentation/${token}`;
}

/** GET — the active projector link (if any). */
export async function GET() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const display = await getActiveDisplay();
  return jsonOk({
    token: display?.token ?? null,
    url: display ? linkFor(display.token) : null,
    createdAt: display?.createdAt ?? null,
  });
}

/** POST — generate a fresh link (revokes the previous one). */
export async function POST() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const { row } = await createDisplayToken();
  await logActivity({ action: "display_token_created", adminSessionId: guard.session.id });
  return jsonOk({ token: row.token, url: linkFor(row.token), createdAt: row.createdAt });
}

/** DELETE — revoke the current link. */
export async function DELETE() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const revoked = await revokeActiveDisplay();
  if (revoked) {
    await logActivity({ action: "display_token_revoked", adminSessionId: guard.session.id });
  }
  return jsonOk({ ok: true, revoked });
}
