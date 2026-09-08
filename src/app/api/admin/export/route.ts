import { NextRequest } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { db } from "@/db";
import { participants } from "@/db/schema";
import { asc } from "drizzle-orm";
import {
  buildBackupCsv,
  buildBackupXlsx,
  buildNamesCsv,
  buildNamesXlsx,
} from "@/lib/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ ok: false }, { status: 401 });

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") === "backup" ? "backup" : "names";
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  const list = await db
    .select()
    .from(participants)
    .orderBy(asc(participants.displayOrder), asc(participants.submittedAt));

  const stamp = new Date().toISOString().slice(0, 10);
  const filename =
    kind === "names"
      ? `graduates-names-${stamp}.${format}`
      : `graduates-backup-${stamp}.${format}`;

  if (format === "csv") {
    const body = kind === "names" ? buildNamesCsv(list) : buildBackupCsv(list);
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const buf = kind === "names" ? buildNamesXlsx(list) : buildBackupXlsx(list);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
