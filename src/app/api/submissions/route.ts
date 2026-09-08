import { NextRequest } from "next/server";
import { db } from "@/db";
import { groups, participants } from "@/db/schema";
import { desc, sql } from "drizzle-orm";

export const runtime = "nodejs";

interface MemberPayload {
  fullName?: string;
  childhoodUrl?: string;
  adultUrl?: string;
  graduationUrl?: string | null;
  gradStatus?: string | null;
}

const okUrl = (u?: string | null) =>
  !!u && (/^\/api\/media\/staging\//.test(u) || /^https:\/\/.*staging/.test(u));

import { ensureDbReady } from "@/db";

export async function POST(req: NextRequest) {
  try {
    await ensureDbReady();
    const body = (await req.json()) as {
      type?: string;
      members?: MemberPayload[];
    };
    const type = body.type === "group" ? "GROUP" : "SOLO";
    const members = Array.isArray(body.members) ? body.members : [];

    if (members.length < 1 || members.length > 12) {
      return Response.json(
        { ok: false, error: "عدد الأعضاء يجب أن يكون بين ١ و ١٢" },
        { status: 400 },
      );
    }

    for (const m of members) {
      const name = (m.fullName ?? "").trim().replace(/\s+/g, " ");
      if (name.split(" ").filter(Boolean).length < 4) {
        return Response.json(
          { ok: false, error: "الاسم يجب أن يكون رباعيًا (٤ أجزاء على الأقل)" },
          { status: 400 },
        );
      }
      if (!okUrl(m.childhoodUrl) || !okUrl(m.adultUrl)) {
        return Response.json(
          { ok: false, error: "يجب رفع صورتي الطفولة والحالية قبل التسليم" },
          { status: 400 },
        );
      }
      if (m.graduationUrl && !okUrl(m.graduationUrl)) {
        return Response.json(
          { ok: false, error: "رابط صورة التخرج غير صالح" },
          { status: 400 },
        );
      }
    }

    const maxRow = await db
      .select({ max: sql<number | null>`max(${participants.displayOrder})` })
      .from(participants);
    let nextOrder = (maxRow[0]?.max ?? 0) + 1;

    let groupId: string | null = null;
    if (type === "GROUP") {
      const g = await db.insert(groups).values({}).returning({ id: groups.id });
      groupId = g[0].id;
    }

    const submittedAt = new Date();
    const created = [];
    for (const m of members) {
      const rows = await db
        .insert(participants)
        .values({
          fullName: (m.fullName ?? "").trim().replace(/\s+/g, " "),
          groupId,
          submissionType: type,
          childhoodImageUrl: m.childhoodUrl!,
          adultImageUrl: m.adultUrl!,
          graduationImageUrl: m.graduationUrl ?? null,
          gradImageStatus: m.graduationUrl ? "READY" : m.gradStatus === "FAILED" ? "FAILED" : "PENDING",
          displayOrder: nextOrder++,
          submittedAt,
        })
        .returning({ id: participants.id });
      created.push(rows[0].id);
    }

    return Response.json({
      ok: true,
      count: created.length,
      submittedAt: submittedAt.toISOString(),
      groupId,
    });
  } catch (e) {
    console.error("submission error", e);
    return Response.json(
      { ok: false, error: "حدث خطأ أثناء حفظ التقديم، حاول مرة أخرى" },
      { status: 500 },
    );
  }
}
