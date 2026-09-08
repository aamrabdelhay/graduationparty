import { NextRequest, NextResponse } from "next/server";
import {
  adminPassword,
  clientIp,
  createSession,
  loginBlockedSeconds,
  recordLoginAttempt,
  sessionCookieValue,
} from "@/lib/auth";
import { listUnacknowledgedDiscarded } from "@/lib/drafts";
import crypto from "crypto";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  try {
    const blocked = await loginBlockedSeconds(ip);
    if (blocked > 0) {
      return Response.json(
        {
          ok: false,
          error: `محاولات كثيرة. حاول بعد ${blocked} ثانية`,
          retryAfter: blocked,
        },
        { status: 429, headers: { "Retry-After": String(blocked) } },
      );
    }

    const body = (await req.json().catch(() => ({}))) as { password?: string };
    // Normalize: invisible spaces / pasted whitespace should not lock you out.
    const password = String(body.password ?? "").trim();
    const expected = adminPassword().trim();

    // Constant-time comparison over SHA-256 digests: safe for any encoding
    // (e.g. an Arabic keyboard layout producing "عو" instead of "cu").
    const hash = (v: string) =>
      crypto.createHash("sha256").update(v, "utf8").digest();
    const match = crypto.timingSafeEqual(hash(password), hash(expected));

    await recordLoginAttempt(ip, match);
    if (!match) {
      return Response.json(
        { ok: false, error: "كلمة المرور غير صحيحة" },
        { status: 401 },
      );
    }

    const token = await createSession(ip);
    // Reminder data: unsaved changes from previous sessions.
    const discarded = await listUnacknowledgedDiscarded();

    const res = NextResponse.json({
      ok: true,
      previousUnsaved: discarded.length,
    });
    const c = sessionCookieValue(token);
    res.cookies.set(c.name, c.value, c);
    return res;
  } catch (e) {
    console.error("login error", e);
    return Response.json(
      { ok: false, error: "حدث خطأ، حاول مرة أخرى" },
      { status: 500 },
    );
  }
}
