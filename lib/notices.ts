/** Server-persisted notices shown to the admin on next login. */
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { adminNotice } from "@/db/schema";

export interface PendingNotice {
  id: string;
  kind: string;
  count: number;
  createdAt: Date;
}

/** Fetch + consume the most recent notice (shown once on the next dashboard load). */
export async function consumeLatestNotice(): Promise<PendingNotice | null> {
  const db = getDb();
  const rows = await db.select().from(adminNotice).orderBy(desc(adminNotice.createdAt)).limit(1);
  const row = rows[0];
  if (!row) return null;
  await db.delete(adminNotice).where(eq(adminNotice.id, row.id));
  return { id: row.id, kind: row.kind, count: row.count, createdAt: row.createdAt };
}
