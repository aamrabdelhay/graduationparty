/**
 * Brute-force protection for the admin login. Attempts are recorded in the
 * database (survives restarts and works across serverless instances), keyed by
 * a hash of the client IP. Failed attempts older than the window don't count.
 */
import { and, count, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { adminLoginAttempt } from "@/db/schema";
import { sha256Hex } from "@/lib/crypto";
import { logger } from "@/lib/logger";

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILED_ATTEMPTS = 10;

/** Best-effort client IP from standard proxy headers. */
export function clientIpFromHeaders(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "local";
}

export function hashIp(ip: string): string {
  return sha256Hex(`gp-login:${ip}`);
}

export async function recordLoginAttempt(ip: string, success: boolean): Promise<void> {
  try {
    await getDb().insert(adminLoginAttempt).values({ ipHash: hashIp(ip), success });
  } catch (err) {
    logger.error("login attempt record failed", { error: (err as Error).message });
  }
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  remainingAttempts: number;
}

export async function checkLoginRateLimit(ip: string): Promise<RateLimitResult> {
  const since = new Date(Date.now() - LOGIN_WINDOW_MS);
  const db = getDb();
  const [row] = await db
    .select({ n: count() })
    .from(adminLoginAttempt)
    .where(
      and(
        eq(adminLoginAttempt.ipHash, hashIp(ip)),
        eq(adminLoginAttempt.success, false),
        gt(adminLoginAttempt.createdAt, since),
      ),
    );
  const failed = row?.n ?? 0;
  if (failed >= MAX_FAILED_ATTEMPTS) {
    const oldest = await db
      .select()
      .from(adminLoginAttempt)
      .where(and(eq(adminLoginAttempt.ipHash, hashIp(ip)), eq(adminLoginAttempt.success, false), gt(adminLoginAttempt.createdAt, since)))
      .orderBy(adminLoginAttempt.createdAt)
      .limit(1);
    const oldestAt = oldest[0]?.createdAt ?? new Date();
    const retryAfter = Math.max(1, Math.ceil((oldestAt.getTime() + LOGIN_WINDOW_MS - Date.now()) / 1000));
    return { allowed: false, retryAfterSeconds: retryAfter, remainingAttempts: 0 };
  }
  return { allowed: true, retryAfterSeconds: 0, remainingAttempts: MAX_FAILED_ATTEMPTS - failed };
}
