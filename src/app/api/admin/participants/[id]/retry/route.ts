import { NextRequest } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { db } from "@/db";
import { participants } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  generateGraduationImage,
  loadImageBuffer,
  storeImage,
} from "@/lib/media";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Retry the AI graduation-image pipeline for a participant. */
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ ok: false }, { status: 401 });

  const { id } = await params;
  const rows = await db
    .select()
    .from(participants)
    .where(eq(participants.id, id))
    .limit(1);
  const p = rows[0];
  if (!p) return Response.json({ ok: false, error: "غير موجود" }, { status: 404 });
  if (!p.adultImageUrl) {
    return Response.json(
      { ok: false, error: "لا توجد صورة أساسية للمعالجة" },
      { status: 400 },
    );
  }

  await db
    .update(participants)
    .set({ gradImageStatus: "PROCESSING", aiError: null, updatedAt: new Date() })
    .where(eq(participants.id, id));

  try {
    const buf = await loadImageBuffer(p.adultImageUrl);
    const out = await generateGraduationImage(buf);
    const url = await storeImage(out, "generated");
    const updated = await db
      .update(participants)
      .set({
        graduationImageUrl: url,
        gradImageStatus: "READY",
        aiError: null,
        updatedAt: new Date(),
      })
      .where(eq(participants.id, id))
      .returning();
    return Response.json({ ok: true, participant: updated[0] });
  } catch (e) {
    await db
      .update(participants)
      .set({
        gradImageStatus: "FAILED",
        aiError: e instanceof Error ? e.message : "فشل غير معروف",
        updatedAt: new Date(),
      })
      .where(eq(participants.id, id));
    return Response.json(
      {
        ok: false,
        error: "فشل توليد صورة التخرج — الصورة الأصلية محفوظة ويمكن إعادة المحاولة",
      },
      { status: 502 },
    );
  }
}
