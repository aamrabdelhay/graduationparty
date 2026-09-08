import { NextRequest } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { db } from "@/db";
import { displayTokens } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { newDisplayToken } from "@/lib/presentation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ ok: false }, { status: 401 });
  const tokens = await db
    .select()
    .from(displayTokens)
    .orderBy(desc(displayTokens.createdAt));
  return Response.json({ ok: true, tokens });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ ok: false }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { label?: string };
  const created = await db
    .insert(displayTokens)
    .values({ token: newDisplayToken(), label: body.label ?? "شاشة العرض" })
    .returning();
  return Response.json({ ok: true, token: created[0] });
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ ok: false }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { id?: string; all?: boolean };
  if (body.all) {
    await db
      .update(displayTokens)
      .set({ revokedAt: new Date() })
      .where(eq(displayTokens.id, displayTokens.id));
    return Response.json({ ok: true });
  }
  if (!body.id) return Response.json({ ok: false, error: "id مطلوب" }, { status: 400 });
  await db
    .update(displayTokens)
    .set({ revokedAt: new Date() })
    .where(eq(displayTokens.id, body.id));
  return Response.json({ ok: true });
}
