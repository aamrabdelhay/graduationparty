import { NextRequest } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { upsertDraft, listOpenDrafts, DraftField } from "@/lib/drafts";
import { db } from "@/db";
import { drafts } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ ok: false }, { status: 401 });
  const open = await listOpenDrafts(session.id);
  return Response.json({
    ok: true,
    drafts: open.map((d) => ({
      id: d.draft.id,
      participantId: d.draft.participantId,
      participantName: d.participantName,
      field: d.draft.field,
      previousValue: d.draft.previousValue,
      newValue: d.draft.newValue,
      expectedVersion: d.draft.expectedVersion,
      updatedAt: d.draft.updatedAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ ok: false }, { status: 401 });
  try {
    const body = (await req.json()) as {
      participantId?: string;
      field?: DraftField;
      newValue?: string | null;
    };
    if (!body.participantId || !body.field) {
      return Response.json({ ok: false, error: "بيانات ناقصة" }, { status: 400 });
    }
    const draft = await upsertDraft(
      session.id,
      body.participantId,
      body.field,
      body.newValue ?? null,
    );
    return Response.json({ ok: true, draft });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "خطأ" },
      { status: 400 },
    );
  }
}

/** Remove a single open draft (used when resolving conflicts). */
export async function DELETE(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ ok: false }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { draftId?: string };
  if (!body.draftId) {
    return Response.json({ ok: false, error: "draftId مطلوب" }, { status: 400 });
  }
  await db
    .delete(drafts)
    .where(
      and(
        eq(drafts.id, body.draftId),
        eq(drafts.sessionId, session.id),
        eq(drafts.status, "OPEN"),
      ),
    );
  return Response.json({ ok: true });
}
