/**
 * Presentation display tokens. A random URL-safe token grants read access to
 * the minimal public projector payload (never the whole database). Tokens can
 * be revoked and re-generated from the admin settings.
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { presentationDisplay } from "@/db/schema";
import { randomToken, sha256Hex } from "@/lib/crypto";
import type { PresentationDisplayRow } from "@/db/schema";

export function generateDisplayToken(): string {
  return randomToken(24);
}

export function hashDisplayToken(token: string): string {
  return sha256Hex(`presentation-display:${token}`);
}

export async function createDisplayToken(): Promise<{ row: PresentationDisplayRow; rawToken: string }> {
  const db = getDb();
  // Only one active display link at a time — revoke the previous one.
  await db.update(presentationDisplay).set({ active: false, revokedAt: new Date() }).where(eq(presentationDisplay.active, true));
  const rawToken = generateDisplayToken();
  const [row] = await db
    .insert(presentationDisplay)
    .values({ token: rawToken, tokenHash: hashDisplayToken(rawToken), active: true })
    .returning();
  return { row, rawToken };
}

export async function getActiveDisplay(): Promise<PresentationDisplayRow | null> {
  const rows = await getDb()
    .select()
    .from(presentationDisplay)
    .where(and(eq(presentationDisplay.active, true), isNull(presentationDisplay.revokedAt)))
    .orderBy(desc(presentationDisplay.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function revokeActiveDisplay(): Promise<boolean> {
  const res = await getDb()
    .update(presentationDisplay)
    .set({ active: false, revokedAt: new Date() })
    .where(and(eq(presentationDisplay.active, true), isNull(presentationDisplay.revokedAt)))
    .returning({ id: presentationDisplay.id });
  return res.length > 0;
}

export async function verifyDisplayToken(rawToken: string): Promise<PresentationDisplayRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(presentationDisplay)
    .where(and(eq(presentationDisplay.tokenHash, hashDisplayToken(rawToken)), eq(presentationDisplay.active, true), isNull(presentationDisplay.revokedAt)))
    .limit(1);
  const row = rows[0] ?? null;
  if (row) {
    await db.update(presentationDisplay).set({ lastSeenAt: new Date() }).where(eq(presentationDisplay.id, row.id));
  }
  return row;
}
