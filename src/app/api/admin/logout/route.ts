import { NextRequest, NextResponse } from "next/server";
import { deactivateSession, getSessionFromCookies, SESSION_COOKIE } from "@/lib/auth";
import { discardOpenDrafts } from "@/lib/drafts";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies();
  let discarded = 0;
  if (session) {
    // Explicit logout without saving -> persist the discarded-draft event.
    discarded = await discardOpenDrafts(session.id);
    await deactivateSession(session.id);
  }
  const res = NextResponse.json({ ok: true, discarded });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
