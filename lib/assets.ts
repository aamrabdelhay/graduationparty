/**
 * ImageAsset lifecycle: create (store file + row), commit/attach, delete
 * (row + object-storage file), and cleanup of orphaned assets.
 */
import { randomUUID } from "node:crypto";
import { and, eq, isNull, lt } from "drizzle-orm";
import { getDb, type Tx } from "@/db";
import { imageAsset } from "@/db/schema";
import type { ImageAssetRow, ImageKind } from "@/db/schema";
import { getStorage, deleteStoredObject } from "@/lib/storage";
import { getStorageProvider } from "@/lib/env";
import { logger } from "@/lib/logger";

export interface CreateAssetInput {
  kind: ImageKind;
  buffer: Buffer;
  mimeType: string;
  extension: string;
  width: number;
  height: number;
  /** committed=false -> staged asset (public preview draft or unsaved admin replacement) */
  committed?: boolean;
  participantId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function createImageAsset(input: CreateAssetInput): Promise<ImageAssetRow> {
  const provider = getStorageProvider();

  // Neon is the durable fallback when Vercel Blob is not configured. Keep the
  // normalized image bytes in JSONB so uploads work without an external bucket.
  if (provider === "database") {
    const id = randomUUID();
    const key = `database/${input.kind.toLowerCase()}/${id}.${input.extension}`;
    const [row] = await getDb()
      .insert(imageAsset)
      .values({
        id,
        kind: input.kind,
        storageProvider: provider,
        storageKey: key,
        publicUrl: `/api/images/${id}`,
        mimeType: input.mimeType,
        fileSize: input.buffer.byteLength,
        width: input.width,
        height: input.height,
        committed: input.committed ?? false,
        participantId: input.participantId ?? null,
        metadata: {
          ...(input.metadata ?? {}),
          _databaseImageBase64: input.buffer.toString("base64"),
        },
      })
      .returning();
    logger.info("image_asset_stored_in_database", { id, bytes: input.buffer.byteLength });
    return row;
  }

  const storage = getStorage();
  const stored = await storage.put({
    folder: input.kind.toLowerCase(),
    extension: input.extension,
    data: input.buffer,
    contentType: input.mimeType,
  });
  const db = getDb();
  const [row] = await db
    .insert(imageAsset)
    .values({
      kind: input.kind,
      storageProvider: stored.provider,
      storageKey: stored.key,
      publicUrl: stored.url,
      mimeType: input.mimeType,
      fileSize: input.buffer.byteLength,
      width: input.width,
      height: input.height,
      committed: input.committed ?? false,
      participantId: input.participantId ?? null,
      metadata: input.metadata ?? {},
    })
    .returning();
  return row;
}

export async function getAsset(id: string): Promise<ImageAssetRow | null> {
  if (!id) return null;
  const rows = await getDb().select().from(imageAsset).where(eq(imageAsset.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Mark an asset attached/owned (happens at final submission/save). */
export async function commitAsset(id: string, participantId: string, tx?: Tx): Promise<void> {
  const db = tx ?? getDb();
  await db
    .update(imageAsset)
    .set({ committed: true, participantId })
    .where(eq(imageAsset.id, id));
}

export async function updateAssetParticipantLink(id: string, participantId: string | null, tx?: Tx): Promise<void> {
  const db = tx ?? getDb();
  await db.update(imageAsset).set({ participantId }).where(eq(imageAsset.id, id));
}

/** Delete a stored file + its row. Never throws on missing files. */
export async function deleteImageAsset(row: Pick<ImageAssetRow, "id" | "storageKey" | "storageProvider">, tx?: Tx): Promise<void> {
  if (row.storageProvider !== "database") {
    await deleteStoredObject(row.storageKey, row.storageProvider);
  }
  const db = tx ?? getDb();
  await db.delete(imageAsset).where(eq(imageAsset.id, row.id));
}

/** Remove every ImageAsset that is uncommitted and older than the threshold
 *  (orphans from abandoned public drafts or discarded admin replacements). */
export async function cleanupOrphanAssets(hoursOld = 24): Promise<number> {
  const cutoff = new Date(Date.now() - hoursOld * 60 * 60 * 1000);
  const rows = await getDb()
    .select()
    .from(imageAsset)
    .where(and(eq(imageAsset.committed, false), isNull(imageAsset.participantId), lt(imageAsset.createdAt, cutoff)));
  let removed = 0;
  for (const row of rows) {
    if (row.storageProvider !== "database") {
      await deleteStoredObject(row.storageKey, row.storageProvider);
    }
    await getDb().delete(imageAsset).where(eq(imageAsset.id, row.id));
    removed += 1;
  }
  if (removed > 0) logger.info("cleanup_orphan_assets", { removed });
  return removed;
}
