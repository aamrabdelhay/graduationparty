import { getSessionFromCookies } from "@/lib/auth";
import { listOpenDrafts, listUnacknowledgedDiscarded } from "@/lib/drafts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return Response.json({ ok: false }, { status: 401 });
  }
  const open = await listOpenDrafts(session.id);
  const discarded = await listUnacknowledgedDiscarded();
  return Response.json({
    ok: true,
    session: { createdAt: session.createdAt, ip: session.ip },
    openDrafts: open.map((d) => ({
      id: d.draft.id,
      participantId: d.draft.participantId,
      participantName: d.participantName,
      field: d.draft.field,
      previousValue: d.draft.previousValue,
      newValue: d.draft.newValue,
      updatedAt: d.draft.updatedAt,
    })),
    discarded: discarded.map((d) => ({
      id: d.draft.id,
      participantId: d.draft.participantId,
      participantName: d.participantName,
      field: d.draft.field,
      previousValue: d.draft.previousValue,
      newValue: d.draft.newValue,
      updatedAt: d.draft.updatedAt,
    })),
  });
}
