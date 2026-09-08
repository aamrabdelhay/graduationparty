import { NextRequest } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { saveDrafts } from "@/lib/drafts";
import { broadcast } from "@/lib/presentation";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ ok: false }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    forceParticipantIds?: string[];
  };
  const { applied, conflicts } = await saveDrafts(
    session.id,
    Array.isArray(body.forceParticipantIds) ? body.forceParticipantIds : [],
  );

  if (conflicts.length > 0) {
    return Response.json(
      { ok: false, conflicts, applied },
      { status: 409 },
    );
  }

  // Queue order / names may have changed -> keep projector in sync.
  broadcast().catch(() => undefined);
  return Response.json({ ok: true, applied, conflicts: [] });
}
