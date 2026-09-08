import { NextRequest } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { db } from "@/db";
import { groups, participants } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { deleteImageByUrl } from "@/lib/media";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ ok: false }, { status: 401 });

  const { id } = await params;
  const rows = await db
    .select()
    .from(participants)
    .where(eq(participants.id, id))
    .limit(1);
  const p = rows[0];
  if (!p) {
    return Response.json({ ok: false, error: "المشارك غير موجود" }, { status: 404 });
  }

  // 1) Delete database record (drafts cascade).
  await db.delete(participants).where(eq(participants.id, id));

  // 2) Delete related image objects (originals + generated).
  await Promise.allSettled([
    deleteImageByUrl(p.childhoodImageUrl),
    deleteImageByUrl(p.adultImageUrl),
    deleteImageByUrl(p.graduationImageUrl),
  ]);

  // 3) Clean up a group that became empty.
  if (p.groupId) {
    const remaining = await db
      .select({ n: sql<number>`count(*)` })
      .from(participants)
      .where(eq(participants.groupId, p.groupId));
    if (Number(remaining[0]?.n ?? 0) === 0) {
      await db.delete(groups).where(eq(groups.id, p.groupId));
    }
  }

  return Response.json({ ok: true });
}
