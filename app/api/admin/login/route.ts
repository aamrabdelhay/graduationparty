import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { jsonError, jsonOk } from "@/lib/http";
import { getAdminPassword } from "@/lib/env";
import { createAdminSession, setSessionCookie } from "@/lib/auth/admin";
import {
  checkLoginRateLimit,
  recordLoginAttempt,
  clientIpFromHeaders,
} from "@/lib/auth/rate-limit";
import { logActivity } from "@/lib/activity";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ password: z.string().max(200) });

/** Password-only admin login (rate limited per IP). */
export async function POST(req: Request) {
  const ip = clientIpFromHeaders(req.headers);
  const rate = await checkLoginRateLimit(ip);
  if (!rate.allowed) {
    return jsonError("Too many failed attempts. Please try again later.", 429, "RATE_LIMITED", {
      retryAfterSeconds: rate.retryAfterSeconds,
    });
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return jsonError("Password required.", 422, "VALIDATION");
  }

  const expected = getAdminPassword();
  const a = Buffer.from(parsed.password);
  const b = Buffer.from(expected);
  const match = a.length === b.length && timingSafeEqual(a, b);

  if (!match) {
    await recordLoginAttempt(ip, false);
    logger.warn("admin login failed", { ip: ip.slice(0, 12) });
    return jsonError("Incorrect password.", 401, "BAD_PASSWORD", {
      remainingAttempts: Math.max(0, rate.remainingAttempts - 1),
    });
  }

  await recordLoginAttempt(ip, true);
  const { rawToken } = await createAdminSession();
  await setSessionCookie(rawToken);
  await logActivity({ action: "admin_login" });
  return jsonOk({ ok: true });
}
