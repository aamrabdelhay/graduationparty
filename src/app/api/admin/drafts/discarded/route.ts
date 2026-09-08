import { NextRequest } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import {
  acknowledgeDiscarded,
  listUnacknowledgedDiscarded,
  restoreDiscarded,
} from "@/lib/drafts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ ok: false }, { status: 401 });
  const items = await listUnacknowledgedDiscarded();
  return Response.json({
    ok: true,
    discarded: items.map((d) => ({
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

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ ok: false }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    action?: "ack" | "restore";
    ids?: string[];
  };

  if (body.action === "restore") {
    const restored = await restoreDiscarded(
      session.id,
      Array.isArray(body.ids) ? body.ids : [],
    );
    return Response.json({ ok: true, restored });
  }

  await acknowledgeDiscarded();
  return Response.json({ ok: true });
}
