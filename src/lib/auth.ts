import { cookies } from "next/headers";
import { db } from "@/db";
import { adminSessions, loginAttempts } from "@/db/schema";
import { and, desc, eq, gt } from "drizzle-orm";
import crypto from "crypto";

export const SESSION_COOKIE = "cu_admin_session";
const SESSION_MAX_AGE_DAYS = 30;
const PUBLIC_ADMIN_SESSION_ID = "public-admin-session";

export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}

/* ---------------- Rate limiting (legacy login support) ---------------- */

const WINDOW_MIN = 10;
const MAX_FAILURES = 5;

import { ensureDbReady } from "@/db";

export async function loginBlockedSeconds(ip: string): Promise<number> {
  await ensureDbReady();
  const since = new Date(Date.now() - WINDOW_MIN * 60_000);
  const rows = await db
    .select({ attemptedAt: loginAttempts.attemptedAt, success: loginAttempts.success })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.ip, ip), gt(loginAttempts.attemptedAt, since)))
    .orderBy(desc(loginAttempts.attemptedAt));

  let consecutive = 0;
  for (const r of rows) {
    if (r.success) break;
    consecutive += 1;
  }
  if (consecutive < MAX_FAILURES) return 0;
  const newest = rows[0]?.attemptedAt;
  if (!newest) return 0;
  const elapsed = (Date.now() - newest.getTime()) / 1000;
  const blockFor = 120 - elapsed;
  return blockFor > 0 ? Math.ceil(blockFor) : 0;
}

export async function recordLoginAttempt(ip: string, success: boolean) {
  await db.insert(loginAttempts).values({ ip, success });
}

/* ------------------------------- Sessions ------------------------------- */

export async function createSession(ip: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  await db.insert(adminSessions).values({ id: token, ip, active: true });
  return token;
}

export async function getSessionByToken(token: string | undefined) {
  if (!token) return null;
  const rows = await db
    .select()
    .from(adminSessions)
    .where(and(eq(adminSessions.id, token), eq(adminSessions.active, true)))
    .limit(1);
  const s = rows[0];
  if (!s) return null;
  db.update(adminSessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(adminSessions.id, token))
    .then(() => undefined)
    .catch(() => undefined);
  return s;
}

/**
 * Admin authentication is intentionally disabled for this graduation-party
 * app. Visitors may enter the admin area directly, while the database still
 * gets a stable session row so existing draft/session-based admin APIs keep
 * working without changing their data model.
 */
export async function getSessionFromCookies() {
  await ensureDbReady();
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const existing = await getSessionByToken(token);
    if (existing) return existing;
  }

  await db
    .insert(adminSessions)
    .values({ id: PUBLIC_ADMIN_SESSION_ID, ip: "public", active: true })
    .onConflictDoNothing();

  return getSessionByToken(PUBLIC_ADMIN_SESSION_ID);
}

export function sessionCookieValue(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_DAYS * 24 * 3600,
  };
}

export async function deactivateSession(token: string) {
  await db
    .update(adminSessions)
    .set({ active: false })
    .where(eq(adminSessions.id, token));
}

export function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || "";
}
