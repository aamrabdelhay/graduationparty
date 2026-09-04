/**
 * Final submission service (public confirm & submit + admin manual add).
 *
 * Runs in one transaction under an advisory lock so queue positions and group
 * numbers are assigned without races. The authoritative timestamp comes from
 * the server (new Date() at the start of the transaction), never the client.
 */
import { sql, eq, inArray } from "drizzle-orm";
import { getDb, type Tx } from "@/db";
import { group, participant, submission, imageAsset } from "@/db/schema";
import type { SubmissionType, ParticipantSource } from "@/db/schema";
import { normalizeName } from "@/lib/validation";
import { commitAsset } from "@/lib/assets";
import { logActivity } from "@/lib/activity";
import { PRESENTATION_LOCK_KEY } from "@/lib/presentation/state";
import { deleteStoredObject } from "@/lib/storage";

export interface SubmissionParticipantInput {
  fullName: string;
  childhoodImageId: string;
  adultImageId: string;
  graduationImageId?: string | null;
}

export interface CreateSubmissionResult {
  submissionId: string;
  type: SubmissionType;
  groupId: string | null;
  groupNumber: number | null;
  participantIds: string[];
  submittedAt: Date;
  presentationOrderStart: number;
}

async function validateAssets(tx: Tx, fullName: string, adult: string, child: string, grad: string | null | undefined): Promise<void> {
  const ids = [child, adult, ...(grad ? [grad] : [])];
  const rows = await tx.select().from(imageAsset).where(inArray(imageAsset.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const expectKind = (id: string, kind: string) => {
    const row = byId.get(id);
    if (!row) throw new Error("One of the uploaded photos no longer exists. Please re-upload it.");
    if (row.kind !== kind) throw new Error(`Wrong photo kind for participant "${fullName}".`);
    if (row.committed) throw new Error("A photo has already been used in another submission. Please re-upload it.");
  };
  expectKind(child, "CHILDHOOD");
  expectKind(adult, "ADULT");
  if (grad) expectKind(grad, "GRADUATION");
}

export async function createSubmission(input: {
  type: SubmissionType;
  participants: SubmissionParticipantInput[];
  source?: ParticipantSource;
}): Promise<CreateSubmissionResult> {
  const db = getDb();
  const source: ParticipantSource = input.source ?? "PUBLIC";
  const submittedAt = new Date();
  return db.transaction(async (tx) => {
    await tx.execute(`select pg_advisory_xact_lock(${PRESENTATION_LOCK_KEY})`);

    let groupId: string | null = null;
    let groupNumber: number | null = null;

    if (input.type === "GROUP") {
      const nextRes = await tx.execute(sql`select coalesce(max(number), 0) + 1 as n from ${group}`);
      groupNumber = Number((nextRes.rows as Array<{ n?: unknown }>)[0]?.n ?? 1);
      const [g] = await tx.insert(group).values({ number: groupNumber, updatedAt: new Date() }).returning();
      groupId = g.id;
    }

    const [sub] = await tx
      .insert(submission)
      .values({ type: input.type, groupId, submittedAt, createdAt: submittedAt, updatedAt: submittedAt })
      .returning();

    const maxOrderRes = await tx.execute(sql`select coalesce(max(presentation_order), 0) as m from ${participant}`);
    const baseOrder = Number((maxOrderRes.rows as Array<{ m?: unknown }>)[0]?.m ?? 0);

    const participantIds: string[] = [];
    let idx = 0;
    for (const p of input.participants) {
      idx += 1;
      await validateAssets(tx, p.fullName, p.adultImageId, p.childhoodImageId, p.graduationImageId);
      const name = normalizeName(p.fullName);
      const [row] = await tx
        .insert(participant)
        .values({
          fullName: name,
          groupId,
          submissionId: sub.id,
          childhoodImageId: p.childhoodImageId,
          adultImageId: p.adultImageId,
          graduationImageId: p.graduationImageId ?? null,
          aiStatus: p.graduationImageId ? "COMPLETED" : "PENDING",
          aiError: null,
          presentationStatus: "QUEUED",
          presentationOrder: baseOrder + idx,
          source,
          groupPosition: input.type === "GROUP" ? idx : null,
          version: 1,
          createdAt: submittedAt,
          updatedAt: submittedAt,
        })
        .returning();
      participantIds.push(row.id);

      await commitAsset(p.childhoodImageId, row.id, tx);
      await commitAsset(p.adultImageId, row.id, tx);
      if (p.graduationImageId) await commitAsset(p.graduationImageId, row.id, tx);
    }

    return {
      submissionId: sub.id,
      type: input.type,
      groupId,
      groupNumber,
      participantIds,
      submittedAt,
      presentationOrderStart: baseOrder + 1,
    };
  });
}

export async function deleteParticipantRecord(id: string): Promise<boolean> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(`select pg_advisory_xact_lock(${PRESENTATION_LOCK_KEY})`);
    const rows = await tx.select().from(participant).where(eq(participant.id, id)).limit(1);
    const row = rows[0];
    if (!row) return false;
    await deleteParticipantTx(tx, row);
    return true;
  });
}

/** Shared deletion logic (used by draft saves + explicit deletes). */
export async function deleteParticipantTx(tx: Tx, row: typeof participant.$inferSelect): Promise<void> {
  await tx.delete(participant).where(eq(participant.id, row.id));
  // Staged (uncommitted) assets linked to this participant.
  const staged = await tx.select().from(imageAsset).where(eq(imageAsset.participantId, row.id));
  for (const asset of staged) {
    await tx.delete(imageAsset).where(eq(imageAsset.id, asset.id));
    await deleteStoredObject(asset.storageKey, asset.storageProvider).catch(() => undefined);
  }
  // Owned committed assets — only when no other participant references them.
  const owned = [row.childhoodImageId, row.adultImageId, ...(row.graduationImageId ? [row.graduationImageId] : [])];
  for (const assetId of owned) {
    const referenced = await tx.execute(
      sql`select 1 from ${participant} where id != ${row.id} and (
        childhood_image_id = ${assetId} or adult_image_id = ${assetId} or graduation_image_id = ${assetId}
      ) limit 1`,
    );
    const cnt = Number((referenced as { rowCount?: number | null }).rowCount ?? 0);
    if (cnt > 0) continue;
    const assetRows = await tx.select().from(imageAsset).where(eq(imageAsset.id, assetId));
    for (const a of assetRows) {
      await tx.delete(imageAsset).where(eq(imageAsset.id, a.id));
      await deleteStoredObject(a.storageKey, a.storageProvider).catch(() => undefined);
    }
  }
}

/** Delete an entire group + its submission (explicit admin action). */
export async function deleteGroupWithMembers(groupId: string): Promise<boolean> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(`select pg_advisory_xact_lock(${PRESENTATION_LOCK_KEY})`);
    const members = await tx.select().from(participant).where(eq(participant.groupId, groupId));
    for (const m of members) await deleteParticipantTx(tx, m);
    const subs = await tx.select().from(submission).where(eq(submission.groupId, groupId));
    for (const s of subs) {
      const remaining = await tx.select({ id: participant.id }).from(participant).where(eq(participant.submissionId, s.id));
      if (remaining.length === 0) await tx.delete(submission).where(eq(submission.id, s.id));
    }
    await tx.delete(group).where(eq(group.id, groupId));
    await logActivity({ action: "group_deleted", metadata: { groupId } });
    return true;
  });
}
