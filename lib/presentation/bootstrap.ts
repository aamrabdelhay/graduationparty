import { asc, eq, isNull } from "drizzle-orm";
import { getDb, type Db, type Tx } from "@/db";
import { participant } from "@/db/schema";

function resolveDb(tx?: Tx): Db {
  return tx ? (tx as unknown as Db) : getDb();
}

/**
 * Ensure every participant has a stable presentation position.
 * Older submissions can have a null presentationOrder; without an order they
 * were invisible to the slideshow queue. We backfill only missing positions,
 * preserving every order already chosen by the admin.
 */
export async function ensurePresentationQueue(tx?: Tx): Promise<void> {
  const db = resolveDb(tx);
  const rows = await db
    .select({ id: participant.id, presentationOrder: participant.presentationOrder })
    .from(participant)
    .orderBy(asc(participant.createdAt));

  let nextOrder = rows.reduce((max, row) => Math.max(max, row.presentationOrder ?? 0), 0) + 1;
  for (const row of rows) {
    if (row.presentationOrder !== null) continue;
    await db.update(participant).set({ presentationOrder: nextOrder }).where(eq(participant.id, row.id));
    nextOrder += 1;
  }
}
