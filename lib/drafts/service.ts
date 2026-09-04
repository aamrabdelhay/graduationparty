/**
 * Server-side "unsaved changes" (admin draft) engine.
 *
 * Every admin edit is first recorded as an AdminDraftChange row under an OPEN
 * AdminDraft for the admin session — before anything touches the real data.
 * Drafts survive refreshes, browser changes and device changes because they
 * live in PostgreSQL. Saving applies the changes inside one transaction
 * (with optimistic-lock conflict detection); discarding deletes staged image
 * assets and marks the draft DISCARDED.
 *
 * Supported change "fields":
 *   participant fields : fullName | childhoodImageId | adultImageId | graduationImageId | _delete
 *   group ops          : group.delete            (newValue = groupId)
 *   queue reorder      : queue.presentationOrder (newValue = ordered participant id list)
 *   settings           : settings.<key>          (e.g. settings.adultDurationMs)
 */
import { and, eq, isNull, sql, inArray } from "drizzle-orm";
import { getDb, type Tx } from "@/db";
import { adminDraft, adminDraftChange, participant, imageAsset, adminNotice, group, presentationState } from "@/db/schema";
import type { AdminDraftChangeRow } from "@/db/schema";
import { getAsset } from "@/lib/assets";
import { normalizeName, fullNameSchema } from "@/lib/validation";
import { deleteParticipantTx } from "@/lib/submissions/service";
import {
  PRESENTATION_LOCK_KEY,
  getQueue,
  ensurePresentationState,
  presentationUpdateSettings,
  validateSettingValue,
  type PresentationSettings,
} from "@/lib/presentation/state";
import { publishPresentationChange } from "@/lib/realtime/bus";
import { deleteStoredObject } from "@/lib/storage";
import { logActivity } from "@/lib/activity";
import { logger } from "@/lib/logger";

const PARTICIPANT_FIELDS = new Set(["fullName", "childhoodImageId", "adultImageId", "graduationImageId", "_delete"]);
const IMAGE_FIELDS: Record<string, "CHILDHOOD" | "ADULT" | "GRADUATION"> = {
  childhoodImageId: "CHILDHOOD",
  adultImageId: "ADULT",
  graduationImageId: "GRADUATION",
};

export interface AddChangeInput {
  participantId?: string | null;
  field: string;
  newValue: unknown;
}

/**
 * admin_draft_change.previous_value / new_value are jsonb NOT NULL.
 * A JS `null` (e.g. "no previous graduation image yet") must be stored as the
 * JSON literal null — an SQL NULL would violate the constraint.
 */
function jsonValueOrNull(value: unknown) {
  return value === null || value === undefined ? sql`'null'::jsonb` : (value as never);
}

async function requireParticipant(participantId: string) {
  const rows = await getDb().select().from(participant).where(eq(participant.id, participantId)).limit(1);
  return rows[0];
}

async function findOpenDraft(sessionId: string): Promise<{ draft: typeof adminDraft.$inferSelect } | null> {
  const rows = await getDb()
    .select()
    .from(adminDraft)
    .where(and(eq(adminDraft.sessionId, sessionId), eq(adminDraft.status, "OPEN")))
    .orderBy(sql`created_at desc`)
    .limit(1);
  return rows[0] ? { draft: rows[0] } : null;
}

async function ensureOpenDraft(sessionId: string): Promise<typeof adminDraft.$inferSelect> {
  const existing = await findOpenDraft(sessionId);
  if (existing) return existing.draft;
  const [draft] = await getDb()
    .insert(adminDraft)
    .values({ sessionId, status: "OPEN" })
    .returning();
  return draft;
}

async function participantFieldValue(row: typeof participant.$inferSelect, field: string): Promise<unknown> {
  switch (field) {
    case "fullName":
      return row.fullName;
    case "childhoodImageId":
    case "adultImageId":
    case "graduationImageId":
      return row[field];
    case "_delete":
      return false;
    default:
      return null;
  }
}

/** Find an existing OPEN change on the same (participant, field) — null-safe participant match. */
function existingChangeCondition(draftId: string, participantId: string | null | undefined, field: string) {
  const base = [eq(adminDraftChange.draftId, draftId), eq(adminDraftChange.field, field)];
  if (participantId) {
    base.push(eq(adminDraftChange.participantId, participantId));
  } else {
    base.push(isNull(adminDraftChange.participantId));
  }
  return and(...base);
}

async function deleteStagedAssetIfUncommitted(assetId: string): Promise<void> {
  if (!assetId) return;
  const asset = await getAsset(assetId);
  if (!asset || asset.committed) return;
  await deleteStoredObject(asset.storageKey, asset.storageProvider).catch(() => undefined);
  await getDb().delete(imageAsset).where(eq(imageAsset.id, asset.id));
}

/* ------------------------------------------------------------------ */
/* Recording changes                                                   */
/* ------------------------------------------------------------------ */

export async function addDraftChange(sessionId: string, input: AddChangeInput): Promise<{ draftId: string; changeCount: number }> {
  const { participantId, field, newValue } = input;
  const draft = await ensureOpenDraft(sessionId);
  const db = getDb();
  let previousValue: unknown = null;
  let participantVersion: number | null = null;
  let validatedNew: unknown = null;

  if (PARTICIPANT_FIELDS.has(field)) {
    if (!participantId) throw new Error("A participant id is required for this change.");
    const row = await requireParticipant(participantId);
    if (!row) throw new Error("The participant no longer exists.");
    previousValue = await participantFieldValue(row, field);

    if (field === "fullName") {
      validatedNew = normalizeName(fullNameSchema.parse(String(newValue)));
    } else if (IMAGE_FIELDS[field]) {
      if (field === "graduationImageId" && (newValue === null || newValue === undefined)) {
        // Removing the generated graduation image is allowed.
        validatedNew = null;
      } else {
        const id = String(newValue);
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
          throw new Error("Invalid image reference.");
        }
        const asset = await getAsset(id);
        if (!asset) throw new Error("The uploaded image no longer exists. Please upload it again.");
        if (asset.kind !== IMAGE_FIELDS[field]) throw new Error("The uploaded image has the wrong type.");
        if (field === "graduationImageId") validatedNew = id;
        else if (!asset.committed || asset.participantId === participantId) validatedNew = id;
        else throw new Error("This image was already used in another submission.");
      }
    } else if (field === "_delete") {
      validatedNew = Boolean(newValue);
    }
    participantVersion = row.version;
  } else if (field === "group.delete") {
    previousValue = null;
    validatedNew = String(newValue);
  } else if (field === "queue.presentationOrder") {
    if (!Array.isArray(newValue) || newValue.length === 0 || !newValue.every((x) => typeof x === "string")) {
      throw new Error("Invalid queue order.");
    }
    const queue = await getQueue();
    previousValue = queue.map((q) => q.id);
    validatedNew = newValue;
  } else if (field.startsWith("settings.")) {
    const key = field.slice("settings.".length);
    const state = await ensurePresentationState();
    switch (key) {
      case "childhoodDurationMs":
        previousValue = state.childhoodDurationMs;
        break;
      case "smokeDurationMs":
        previousValue = state.smokeDurationMs;
        break;
      case "adultDurationMs":
        previousValue = state.adultDurationMs;
        break;
      case "nameRevealDurationMs":
        previousValue = state.nameRevealDurationMs;
        break;
      case "transitionDurationMs":
        previousValue = state.transitionDurationMs;
        break;
      case "mode":
        previousValue = state.mode;
        break;
      case "autoPlay":
        previousValue = state.autoPlay;
        break;
      case "loopAfterQueueEnd":
        previousValue = state.loopAfterQueueEnd;
        break;
      case "displaySettings":
        previousValue = state.displaySettings;
        break;
      default:
        throw new Error("Unknown settings field.");
    }
    const validationError = validateSettingValue(key, newValue);
    if (validationError) throw new Error(validationError);
    validatedNew = newValue;
  } else {
    throw new Error("Unknown change field.");
  }

  const existing = await db
    .select()
    .from(adminDraftChange)
    .where(existingChangeCondition(draft.id, participantId, field))
    .limit(1);

  if (existing[0]) {
    // Overwriting an earlier staged image in the same draft -> remove that staged file.
    const prev = existing[0].previousValue;
    if (IMAGE_FIELDS[field]) {
      const oldNew = existing[0].newValue as string;
      if (oldNew && oldNew !== String(newValue)) await deleteStagedAssetIfUncommitted(oldNew);
    }
    void prev;
    await db
      .update(adminDraftChange)
      .set({ newValue: jsonValueOrNull(validatedNew), createdAt: new Date() })
      .where(eq(adminDraftChange.id, existing[0].id));
  } else {
    await db.insert(adminDraftChange).values({
      draftId: draft.id,
      participantId: participantId ?? null,
      field,
      previousValue: jsonValueOrNull(previousValue),
      newValue: jsonValueOrNull(validatedNew),
      participantVersion,
    });
  }

  await db
    .update(adminDraft)
    .set({ updatedAt: new Date(), lastModificationAt: new Date() })
    .where(eq(adminDraft.id, draft.id));

  const countRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(adminDraftChange)
    .where(eq(adminDraftChange.draftId, draft.id));
  const changeCount = Number(countRows[0]?.n ?? 0);
  return { draftId: draft.id, changeCount };
}

export interface OpenDraftSummary {
  draftId: string | null;
  changeCount: number;
  changes: Array<{
    id: string;
    participantId: string | null;
    participantName: string | null;
    field: string;
    previousValue: unknown;
    newValue: unknown;
    createdAt: Date;
  }>;
}

export async function getOpenDraftSummary(sessionId: string): Promise<OpenDraftSummary> {
  const open = await findOpenDraft(sessionId);
  if (!open) return { draftId: null, changeCount: 0, changes: [] };
  const changes = await getDb().select().from(adminDraftChange).where(eq(adminDraftChange.draftId, open.draft.id)).orderBy(adminDraftChange.createdAt);
  const participantIds = [...new Set(changes.map((c) => c.participantId).filter((x): x is string => Boolean(x)))];
  const names = new Map<string, string>();
  if (participantIds.length) {
    const rows = await getDb().select({ id: participant.id, fullName: participant.fullName }).from(participant).where(inArray(participant.id, participantIds));
    for (const r of rows) names.set(r.id, r.fullName);
  }
  return {
    draftId: open.draft.id,
    changeCount: changes.length,
    changes: changes.map((c) => ({
      id: c.id,
      participantId: c.participantId,
      participantName: c.participantId ? (names.get(c.participantId) ?? "(deleted)") : null,
      field: c.field,
      previousValue: c.previousValue,
      newValue: c.newValue,
      createdAt: c.createdAt,
    })),
  };
}

export async function hasOpenChanges(sessionId: string): Promise<boolean> {
  const summary = await getOpenDraftSummary(sessionId);
  return summary.changeCount > 0;
}

/* ------------------------------------------------------------------ */
/* Discard                                                             */
/* ------------------------------------------------------------------ */

export async function discardOpenDraft(sessionId: string, opts?: { notifyDiscarded?: boolean }): Promise<{ discarded: number }> {
  const open = await findOpenDraft(sessionId);
  if (!open) return { discarded: 0 };
  const db = getDb();
  const changes = await db.select().from(adminDraftChange).where(eq(adminDraftChange.draftId, open.draft.id));
  let discarded = changes.length;

  // Delete staged (uncommitted) replacement images referenced by image changes.
  for (const c of changes) {
    if (IMAGE_FIELDS[c.field]) {
      const id = c.newValue as string;
      if (id && id !== c.previousValue) await deleteStagedAssetIfUncommitted(id);
    }
  }
  if (opts?.notifyDiscarded && discarded > 0) {
    await db.insert(adminNotice).values({ kind: "DISCARDED_DRAFTS", count: discarded });
  }
  await db.delete(adminDraftChange).where(eq(adminDraftChange.draftId, open.draft.id));
  await db
    .update(adminDraft)
    .set({ status: "DISCARDED", discardedAt: new Date(), updatedAt: new Date() })
    .where(eq(adminDraft.id, open.draft.id));
  return { discarded };
}

/* ------------------------------------------------------------------ */
/* Save                                                                */
/* ------------------------------------------------------------------ */

export interface ConflictInfo {
  participantId: string;
  fullName: string;
  expectedVersion: number;
  actualVersion: number;
}

export interface SaveDraftResult {
  saved: boolean;
  conflicts?: ConflictInfo[];
  appliedParticipantIds: string[];
  deletedParticipantIds: string[];
  queueReordered: boolean;
  settingsChanged: boolean;
  stateVersion?: number;
}

export interface ForceOptions {
  /** Participants where the admin chose to keep the local (draft) values. */
  keepLocal: string[];
  /** Participants where the admin chose to keep the database version. */
  keepDb: string[];
}

export async function saveDraft(sessionId: string, force?: ForceOptions): Promise<SaveDraftResult> {
  const db = getDb();
  const keepLocalSet = new Set(force?.keepLocal ?? []);
  const keepDbSet = new Set(force?.keepDb ?? []);

  // Activity logging must never run inside the data transaction: the helper
  // uses its own pooled connection, which would block on row locks held by the
  // transaction (and FK checks against rows deleted here). Flush after commit.
  const postCommitLogs: Array<{
    action: string;
    participantId?: string | null;
    adminSessionId?: string | null;
    metadata?: Record<string, unknown>;
  }> = [];

  const result = await db.transaction(async (tx) => {
    await tx.execute(`select pg_advisory_xact_lock(${PRESENTATION_LOCK_KEY})`);
    const open = await findOpenDraft(sessionId);
    if (!open) return { saved: false, appliedParticipantIds: [], deletedParticipantIds: [], queueReordered: false, settingsChanged: false };

    const changes = await tx.select().from(adminDraftChange).where(eq(adminDraftChange.draftId, open.draft.id)).orderBy(adminDraftChange.createdAt);
    if (changes.length === 0) {
      await tx.update(adminDraft).set({ status: "SAVED", savedAt: new Date(), updatedAt: new Date() }).where(eq(adminDraft.id, open.draft.id));
      return { saved: true, appliedParticipantIds: [], deletedParticipantIds: [], queueReordered: false, settingsChanged: false };
    }

    const participantChanges = changes.filter((c) => c.participantId && PARTICIPANT_FIELDS.has(c.field));
    const queueChange = changes.find((c) => c.field === "queue.presentationOrder");
    const settingsChanges = changes.filter((c) => c.field.startsWith("settings."));
    const groupDeleteChange = changes.find((c) => c.field === "group.delete");

    /* ---------- conflict detection (participant-level) ---------- */
    const conflicts: ConflictInfo[] = [];
    const byParticipant = new Map<string, AdminDraftChangeRow[]>();
    for (const c of participantChanges) {
      const pid = c.participantId!;
      const list = byParticipant.get(pid) ?? [];
      list.push(c);
      byParticipant.set(pid, list);
    }
    const currentRows = new Map<string, typeof participant.$inferSelect>();
    if (byParticipant.size) {
      const rows = await tx.select().from(participant).where(inArray(participant.id, [...byParticipant.keys()]));
      for (const r of rows) currentRows.set(r.id, r);
    }

    const toApply: Array<{ pid: string; changes: AdminDraftChangeRow[] }> = [];
    for (const [pid, list] of byParticipant) {
      const current = currentRows.get(pid);
      if (keepDbSet.has(pid)) continue; // discard local for this participant
      if (!current) continue; // participant already deleted elsewhere
      if (!keepLocalSet.has(pid)) {
        const expected = list[0]!.participantVersion;
        if (expected != null && expected !== current.version) {
          conflicts.push({
            participantId: pid,
            fullName: current.fullName,
            expectedVersion: expected,
            actualVersion: current.version,
          });
          continue;
        }
      }
      toApply.push({ pid, changes: list });
    }

    if (conflicts.length > 0) {
      return { saved: false, conflicts, appliedParticipantIds: [], deletedParticipantIds: [], queueReordered: false, settingsChanged: false };
    }

    /* ---------- apply participant changes ---------- */
    const applied: string[] = [];
    const deleted: string[] = [];
    let queueReordered = false;
    for (const { pid, changes: list } of toApply) {
      const current = currentRows.get(pid)!;
      if (current.version === undefined) throw new Error("missing row");
      const newVersion = current.version + 1;
      const isDelete = list.some((c) => c.field === "_delete" && c.newValue === true);
      if (isDelete) {
        // validate remaining changes reference existing assets are irrelevant for deletes
        await deleteParticipantTx(tx, current);
        deleted.push(pid);
        // participantId is omitted: the row no longer exists after commit, so
        // the FK would reject it. The deleted id lives in the metadata instead.
        postCommitLogs.push({ action: "participant_deleted", adminSessionId: sessionId, metadata: { via: "draft_save", deletedParticipantId: pid } });
        continue;
      }
      const update: Partial<typeof participant.$inferSelect> = { version: newVersion, updatedAt: new Date() };
      const oldAssetIds = new Set<string>();
      for (const c of list) {
        if (c.field === "fullName") {
          update.fullName = normalizeName(String(c.newValue));
          continue;
        }
        if (!IMAGE_FIELDS[c.field]) continue;
        if (c.field === "graduationImageId" && (c.newValue === null || c.newValue === undefined)) {
          const oldGradId = current.graduationImageId;
          (update as Record<string, unknown>).graduationImageId = null;
          (update as Record<string, unknown>).aiStatus = "PENDING";
          (update as Record<string, unknown>).aiError = null;
          if (oldGradId) oldAssetIds.add(oldGradId);
          continue;
        }
        const newAssetId = String(c.newValue);
        if (!newAssetId) continue;
        const oldAssetId = current[c.field as keyof typeof participant.$inferSelect] as string | null;
        if (newAssetId === oldAssetId) continue;
        const asset = await tx.select().from(imageAsset).where(eq(imageAsset.id, newAssetId)).limit(1);
        if (!asset[0]) throw new Error("Referenced image is missing.");
        if (!asset[0].committed) {
          await tx.update(imageAsset).set({ committed: true, participantId: pid }).where(eq(imageAsset.id, newAssetId));
        } else if (asset[0].participantId && asset[0].participantId !== pid) {
          throw new Error("Referenced image is already attached to another participant.");
        }
        (update as Record<string, unknown>)[c.field] = newAssetId;
        if (c.field === "graduationImageId") {
          (update as Record<string, unknown>).aiStatus = "COMPLETED";
          (update as Record<string, unknown>).aiError = null;
        }
        if (oldAssetId) oldAssetIds.add(oldAssetId);
      }
      if (Object.keys(update).length > 1) {
        await tx.update(participant).set(update as never).where(eq(participant.id, pid));
        applied.push(pid);
        // The participant row is updated FIRST — only then can the replaced
        // assets be removed (the row no longer references them).
        for (const oldAssetId of oldAssetIds) {
          const referenced = await tx.execute(
            sql`select 1 from ${participant} where id != ${pid} and (
              childhood_image_id = ${oldAssetId} or adult_image_id = ${oldAssetId} or graduation_image_id = ${oldAssetId}
            ) limit 1`,
          );
          if (Number((referenced as { rowCount?: number | null }).rowCount ?? 0) > 0) continue;
          const oldRows = await tx.select().from(imageAsset).where(eq(imageAsset.id, oldAssetId));
          for (const o of oldRows) {
            await tx.delete(imageAsset).where(eq(imageAsset.id, o.id));
            await deleteStoredObject(o.storageKey, o.storageProvider).catch(() => undefined);
          }
        }
      }
    }

    /* ---------- group delete ---------- */
    if (groupDeleteChange) {
      const gid = String(groupDeleteChange.newValue);
      const members = await tx.select().from(participant).where(eq(participant.groupId, gid));
      for (const m of members) {
        await deleteParticipantTx(tx, m);
        deleted.push(m.id);
      }
      await tx.execute(sql`delete from submission where group_id = ${gid}`);
      await tx.delete(group).where(eq(group.id, gid));
      postCommitLogs.push({ action: "group_deleted", adminSessionId: sessionId, metadata: { groupId: gid, memberIds: members.map((m) => m.id), via: "draft_save" } });
    }

    /* ---------- queue reorder ---------- */
    if (queueChange) {
      const order = queueChange.newValue as string[];
      const queueBefore = await getQueue(tx);
      const beforeIds = queueBefore.map((q) => q.id).sort();
      const afterIds = [...order].sort();
      const sameSet = beforeIds.length === afterIds.length && beforeIds.every((id, i) => id === afterIds[i]);
      if (!sameSet) {
        throw new Error("The queue changed since you started editing. Please refresh and reorder again.");
      }
      let i = 0;
      for (const id of order) {
        i += 1;
        await tx.update(participant).set({ presentationOrder: i, updatedAt: new Date() }).where(eq(participant.id, id));
      }
      queueReordered = true;
    }

    /* ---------- settings ---------- */
    let settingsChanged = false;
    if (settingsChanges.length > 0) {
      const patch: Partial<PresentationSettings> = {};
      for (const c of settingsChanges) {
        const key = c.field.slice("settings.".length);
        const value = c.newValue;
        if (typeof value === "number") (patch as Record<string, unknown>)[key] = value;
        else if (typeof value === "boolean") (patch as Record<string, unknown>)[key] = value;
        else if (value === "AUTOMATIC" || value === "MANUAL") (patch as Record<string, unknown>)[key] = value;
        else if (value && typeof value === "object" && !Array.isArray(value)) {
          (patch as Record<string, unknown>)[key] = value;
        }
      }
      await presentationUpdateSettings(patch, tx);
      settingsChanged = true;
    }

    /* ---------- fix presentation state after structural changes ---------- */
    let stateVersion: number | undefined;
    if (deleted.length > 0 || queueReordered) {
      const state = await ensurePresentationState(tx);
      const wasCurrent = Boolean(state.currentParticipantId && deleted.includes(state.currentParticipantId));
      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (wasCurrent) {
        set.currentParticipantId = null;
        set.queuePosition = 0;
        set.playback = "IDLE";
        set.isPaused = true;
      }
      set.sequenceVersion = state.sequenceVersion + 1;
      await tx.update(presentationState).set(set as never).where(eq(presentationState.id, "singleton"));
    }
    const finalState = await ensurePresentationState(tx);
    stateVersion = finalState.sequenceVersion;

    await tx.update(adminDraft).set({ status: "SAVED", savedAt: new Date(), updatedAt: new Date() }).where(eq(adminDraft.id, open.draft.id));

    return { saved: true, appliedParticipantIds: applied, deletedParticipantIds: deleted, queueReordered, settingsChanged, stateVersion };
  });

  for (const entry of postCommitLogs) {
    await logActivity(entry);
  }
  return result;
}

/** Called by API routes after a successful save/discard of structural changes. */
export function publishDraftApplied(stateVersion?: number) {
  publishPresentationChange({ version: stateVersion ?? 0, action: "drafts-applied" });
  logger.info("draft applied + published", { stateVersion });
}
