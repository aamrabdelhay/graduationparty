import { NextRequest } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { db } from "@/db";
import { groups, participants } from "@/db/schema";
import { asc, sql } from "drizzle-orm";
import {
  generateGraduationImage,
  loadImageBuffer,
  storeImage,
} from "@/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ ok: false }, { status: 401 });

  const list = await db
    .select()
    .from(participants)
    .orderBy(asc(participants.displayOrder), asc(participants.submittedAt));
  const g = await db.select().from(groups);
  return Response.json({ ok: true, participants: list, groups: g });
}

/** Add a participant directly from the admin dashboard. */
export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ ok: false }, { status: 401 });

  try {
    const body = (await req.json()) as {
      fullName?: string;
      childhoodUrl?: string;
      adultUrl?: string;
    };
    const name = (body.fullName ?? "").trim().replace(/\s+/g, " ");
    if (name.split(" ").length < 3) {
      return Response.json(
        { ok: false, error: "اكتب الاسم كاملًا" },
        { status: 400 },
      );
    }
    if (!body.childhoodUrl || !body.adultUrl) {
      return Response.json(
        { ok: false, error: "الصورتان مطلوبتان" },
        { status: 400 },
      );
    }

    const maxRow = await db
      .select({ max: sql<number | null>`max(${participants.displayOrder})` })
      .from(participants);
    const displayOrder = (maxRow[0]?.max ?? 0) + 1;

    const created = await db
      .insert(participants)
      .values({
        fullName: name,
        submissionType: "SOLO",
        childhoodImageUrl: body.childhoodUrl,
        adultImageUrl: body.adultUrl,
        displayOrder,
        gradImageStatus: "PROCESSING",
      })
      .returning();
    const p = created[0];

    try {
      const buf = await loadImageBuffer(body.adultUrl);
      const out = await generateGraduationImage(buf);
      const url = await storeImage(out, "generated");
      const updated = await db
        .update(participants)
        .set({ graduationImageUrl: url, gradImageStatus: "READY", updatedAt: new Date() })
        .where(sql`${participants.id} = ${p.id}`)
        .returning();
      return Response.json({ ok: true, participant: updated[0] ?? p });
    } catch (e) {
      await db
        .update(participants)
        .set({
          gradImageStatus: "FAILED",
          aiError: e instanceof Error ? e.message : "فشل",
          updatedAt: new Date(),
        })
        .where(sql`${participants.id} = ${p.id}`);
      return Response.json({ ok: true, participant: { ...p, gradImageStatus: "FAILED" } });
    }
  } catch (e) {
    console.error("admin add participant", e);
    return Response.json(
      { ok: false, error: "تعذر إضافة المشارك" },
      { status: 500 },
    );
  }
}
