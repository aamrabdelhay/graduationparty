/**
 * Admin session management.
 *
 * Login is password-only (ADMIN_PASSWORD env var, checked server-side). On
 * success we create an AdminSession row and set an httpOnly cookie whose value
 * is a high-entropy random token; the DB only stores its sha256 hash. Sessions
 * stay valid until explicit logout — opening the public home page never logs
 * the admin out.
 */
import "server-only";
import { cookies } from "next/headers";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { adminSession } from "@/db/schema";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { getSessionCookieSecure } from "@/lib/env";
import type { AdminSessionRow } from "@/db/schema";

export const ADMIN_SESSION_COOKIE = "gp_admin_session";
const SESSION_TOKEN_BYTES = 32;

export interface SessionInfo {
  session: AdminSessionRow;
  rawToken: string;
}

export async function createAdminSession(): Promise<SessionInfo> {
  const rawToken = randomToken(SESSION_TOKEN_BYTES);
  const hash = sha256Hex(rawToken);
  const [session] = await getDb()
    .insert(adminSession)
    .values({ tokenHash: hash })
    .returning();
  return { session, rawToken };
}

async function findSessionByHash(hash: string): Promise<AdminSessionRow | null> {
  const rows = await getDb()
    .select()
    .from(adminSession)
    .where(and(eq(adminSession.tokenHash, hash), isNull(adminSession.loggedOutAt)))
    .limit(1);
  return rows[0] ?? null;
}

/** Returns the active admin session from the request cookie (server-only). */
export async function getAdminSession(): Promise<AdminSessionRow | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!raw) return null;
  const session = await findSessionByHash(sha256Hex(raw));
  if (!session) return null;
  // Touch lastActivityAt at most once a minute to keep writes cheap.
  if (Date.now() - session.lastActivityAt.getTime() > 60_000) {
    try {
      await getDb()
        .update(adminSession)
        .set({ lastActivityAt: new Date() })
        .where(eq(adminSession.id, session.id));
    } catch {
      /* non fatal */
    }
  }
  return session;
}

export async function isAdminAuthed(): Promise<boolean> {
  return (await getAdminSession()) !== null;
}

export async function setSessionCookie(rawToken: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: getSessionCookieSecure(),
    path: "/",
    // No Max-Age/Expires => browser session cookie. The server session stays
    // valid until logout regardless of navigation, per requirements.
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
}

export async function logoutSessionById(sessionId: string): Promise<void> {
  await getDb()
    .update(adminSession)
    .set({ loggedOutAt: new Date() })
    .where(eq(adminSession.id, sessionId));
}
