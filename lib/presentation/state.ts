/**
 * Server-side presentation state machine.
 *
 * The queue is derived from Participant rows ordered by presentationOrder.
 * Participant.presentationStatus marks where each graduate stands
 * (QUEUED / CURRENT / PRESENTED / SKIPPED). The singleton PresentationState
 * row stores the playhead, playback mode, pause flag and timing settings.
 * Every mutation bumps `sequenceVersion` and publishes a realtime event so the
 * projector + control room stay in sync without polling.
 *
 * Separation kept on purpose:
 *   - Submission order  = Submission.submittedAt (immutable, server clock)
 *   - Presentation order = Participant.presentationOrder (admin controlled)
 */
import { asc, eq, inArray, isNotNull, and } from "drizzle-orm";
import { getDb, type Db, type Tx } from "@/db";
import { participant, presentationState, imageAsset } from "@/db/schema";
import type { ParticipantRow, PresentationStateRow } from "@/db/schema";
import { publishPresentationChange } from "@/lib/realtime/bus";
import { logger } from "@/lib/logger";

/** Resolve a connection to the shared Db type (a Tx is structurally a Db here). */
function resolveDb(tx?: Tx): Db {
  return tx ? (tx as unknown as Db) : getDb();
}

export const PRESENTATION_LOCK_KEY = 87_432_991;

export interface PresentationSettings {
  mode: "AUTOMATIC" | "MANUAL";
  autoPlay: boolean;
  loopAfterQueueEnd: boolean;
  childhoodDurationMs: number;
  smokeDurationMs: number;
  adultDurationMs: number;
  nameRevealDurationMs: number;
  transitionDurationMs: number;
  displaySettings: Record<string, unknown>;
}

export async function ensurePresentationState(tx?: Tx): Promise<PresentationStateRow> {
  const db = resolveDb(tx);
  await db
    .insert(presentationState)
    .values({ id: "singleton" })
    .onConflictDoNothing({ target: presentationState.id });
  const rows = await db.select().from(presentationState).where(eq(presentationState.id, "singleton")).limit(1);
  return rows[0];
}

export async function getPresentationState(): Promise<PresentationStateRow> {
  return ensurePresentationState();
}

export function settingsFromState(s: PresentationStateRow): PresentationSettings {
  return {
    mode: s.mode,
    autoPlay: s.autoPlay,
    loopAfterQueueEnd: s.loopAfterQueueEnd,
    childhoodDurationMs: s.childhoodDurationMs,
    smokeDurationMs: s.smokeDurationMs,
    adultDurationMs: s.adultDurationMs,
    nameRevealDurationMs: s.nameRevealDurationMs,
    transitionDurationMs: s.transitionDurationMs,
    displaySettings: (s.displaySettings ?? {}) as Record<string, unknown>,
  };
}

export interface QueueEntry {
  id: string;
  fullName: string;
  presentationStatus: ParticipantRow["presentationStatus"];
  presentationOrder: number | null;
}

/** Full ordered queue (every non-skipped participant, by presentationOrder). */
export async function getQueue(tx?: Tx): Promise<QueueEntry[]> {
  const d = resolveDb(tx);
  const rows = await d
    .select({
      id: participant.id,
      fullName: participant.fullName,
      presentationStatus: participant.presentationStatus,
      presentationOrder: participant.presentationOrder,
    })
    .from(participant)
    .where(and(isNotNull(participant.presentationOrder), inArray(participant.presentationStatus, ["QUEUED", "CURRENT", "PRESENTED"])))
    .orderBy(asc(participant.presentationOrder));
  return rows;
}

/** Ordered list of participants that can still be shown (not skipped). */
export async function getUpcomingQueue(tx?: Tx): Promise<QueueEntry[]> {
  const d = resolveDb(tx);
  const rows = await d
    .select({
      id: participant.id,
      fullName: participant.fullName,
      presentationStatus: participant.presentationStatus,
      presentationOrder: participant.presentationOrder,
    })
    .from(participant)
    .where(and(isNotNull(participant.presentationOrder), inArray(participant.presentationStatus, ["QUEUED", "CURRENT"])))
    .orderBy(asc(participant.presentationOrder));
  return rows;
}

async function bumpSequence(tx: Tx, next?: Partial<PresentationStateRow>): Promise<PresentationStateRow> {
  const db = resolveDb(tx);
  const current = await ensurePresentationState(tx);
  const updated = await db
    .update(presentationState)
    .set({
      ...(next ?? {}),
      sequenceVersion: (current.sequenceVersion ?? 0) + 1,
      updatedAt: new Date(),
    })
    .where(eq(presentationState.id, "singleton"))
    .returning();
  return updated[0] ?? current;
}

export interface PresentationCommandResult {
  ok: boolean;
  message?: string;
  state?: PresentationStateRow;
}

type CommandFn = (db: Tx) => Promise<{ next?: Partial<PresentationStateRow>; message?: string; changedParticipantIds?: string[] }>;

async function runCommand(fn: CommandFn): Promise<PresentationCommandResult> {
  const db = getDb();
  try {
    const result = await db.transaction(async (tx): Promise<{ state: PresentationStateRow; message?: string }> => {
      await tx.execute(`select pg_advisory_xact_lock(${PRESENTATION_LOCK_KEY})`);
      const res = await fn(tx);
      const state = await bumpSequence(tx, res.next);
      if (res.changedParticipantIds?.length) {
        logger.info("presentation participants changed", { count: res.changedParticipantIds.length });
      }
      return { state, message: res.message };
    });
    // Publish AFTER the transaction committed so subscribers never see partial state.
    publishPresentationChange({ version: result.state.sequenceVersion, action: "state" });
    return { ok: true, message: result.message, state: result.state };
  } catch (err) {
    logger.error("presentation command failed", { error: (err as Error).message });
    return { ok: false, message: "Could not update the presentation." };
  }
}

function requireRow(row: ParticipantRow | undefined, message: string): asserts row is ParticipantRow {
  if (!row) throw new Error(message);
}

/* ------------------------------------------------------------------ */
/* Commands                                                            */
/* ------------------------------------------------------------------ */

export async function presentationStart() {
  return runCommand(async (tx) => {
    const queue = await getUpcomingQueue(tx);
    const current = await ensurePresentationState(tx);
    let target: QueueEntry | undefined;
    if (current.currentParticipantId) {
      const rows = await tx.select().from(participant).where(eq(participant.id, current.currentParticipantId)).limit(1);
      if (rows[0]) target = { id: rows[0].id, fullName: rows[0].fullName, presentationStatus: rows[0].presentationStatus, presentationOrder: rows[0].presentationOrder };
    }
    if (!target) target = queue.find((q) => q.presentationStatus === "QUEUED") ?? queue[0];
    if (!target) return { next: { playback: "IDLE" as const, isPaused: true }, message: "no_queue" };

    // First start: nothing has been presented yet, so the whole queue is QUEUED.
    const queueRows = await tx.select().from(participant).where(inArray(participant.presentationStatus, ["QUEUED"]));
    const ids = new Set(queueRows.map((r) => r.id));
    if (ids.size && !ids.has(target.id)) {
      // Presentation had never run; choose the first QUEUED participant.
      target = queueRows.sort((a, b) => (a.presentationOrder ?? 0) - (b.presentationOrder ?? 0))[0]!;
    }
    await tx.update(participant).set({ presentationStatus: "CURRENT" }).where(eq(participant.id, target.id));
    const queueAfter = await getQueue(tx);
    const pos = Math.max(0, queueAfter.findIndex((q) => q.id === target.id));
    return { next: { currentParticipantId: target.id, queuePosition: pos, playback: "RUNNING", isPaused: false } };
  });
}

export async function presentationPause() {
  return runCommand(async () => {
    const state = await ensurePresentationState();
    if (state.playback === "FINISHED" || state.playback === "IDLE") {
      return { next: { isPaused: true }, message: "already_idle" };
    }
    return { next: { isPaused: true, playback: "PAUSED" as const } };
  });
}

export async function presentationResume() {
  return runCommand(async (tx) => {
    const state = await ensurePresentationState(tx);
    if (!state.currentParticipantId) {
      // Resume with no current participant behaves like Start.
      const queue = await getUpcomingQueue(tx);
      const target = queue.find((q) => q.presentationStatus === "QUEUED") ?? queue[0];
      if (!target) return { next: { playback: "IDLE", isPaused: true }, message: "no_queue" };
      await tx.update(participant).set({ presentationStatus: "CURRENT" }).where(eq(participant.id, target.id));
      const queueAfter = await getQueue(tx);
      const pos = Math.max(0, queueAfter.findIndex((q) => q.id === target.id));
      return { next: { currentParticipantId: target.id, queuePosition: pos, playback: "RUNNING", isPaused: false } };
    }
    if (state.playback === "FINISHED") {
      // Finished but resume pressed: jump back to last current.
      return { next: { isPaused: false, playback: "RUNNING" as const } };
    }
    return { next: { isPaused: false, playback: "RUNNING" as const } };
  });
}

export async function presentationNext() {
  return runCommand(async (tx) => {
    const state = await ensurePresentationState(tx);
    const queue = await getQueue(tx);
    const currentIdx = Math.max(0, queue.findIndex((q) => q.id === state.currentParticipantId));
    const candidates = queue.slice(currentIdx + 1).filter((q) => q.presentationStatus !== "SKIPPED");
    if (state.currentParticipantId) {
      await tx.update(participant).set({ presentationStatus: "PRESENTED" }).where(eq(participant.id, state.currentParticipantId));
    }
    if (candidates.length === 0) {
      // Queue end: loop or finish.
      const loop = (await ensurePresentationState(tx)).loopAfterQueueEnd;
      if (loop) {
        const reset = queue.filter((q) => q.presentationStatus !== "SKIPPED");
        const first = reset[0];
        if (!first) return { next: { playback: "FINISHED" as const, isPaused: true }, message: "queue_end" };
        await tx
          .update(participant)
          .set({ presentationStatus: "QUEUED" })
          .where(inArray(participant.id, reset.map((q) => q.id)));
        await tx.update(participant).set({ presentationStatus: "CURRENT" }).where(eq(participant.id, first.id));
        return { next: { currentParticipantId: first.id, queuePosition: 0, playback: "RUNNING", isPaused: false } };
      }
      return { next: { playback: "FINISHED", isPaused: true }, message: "queue_end" };
    }
    const nextOne = candidates[0]!;
    await tx.update(participant).set({ presentationStatus: "CURRENT" }).where(eq(participant.id, nextOne.id));
    const pos = Math.max(0, queue.findIndex((q) => q.id === nextOne.id));
    return { next: { currentParticipantId: nextOne.id, queuePosition: pos, playback: "RUNNING", isPaused: false } };
  });
}

export async function presentationPrevious() {
  return runCommand(async (tx) => {
    const state = await ensurePresentationState(tx);
    const queue = await getQueue(tx);
    const currentIdx = Math.max(0, queue.findIndex((q) => q.id === state.currentParticipantId));
    const before = queue.slice(0, currentIdx).reverse().filter((q) => q.presentationStatus !== "SKIPPED");
    if (state.currentParticipantId) {
      await tx.update(participant).set({ presentationStatus: "PRESENTED" }).where(eq(participant.id, state.currentParticipantId));
    }
    if (before.length === 0) {
      return { next: {}, message: "at_start" };
    }
    const target = before[0]!;
    await tx.update(participant).set({ presentationStatus: "CURRENT" }).where(eq(participant.id, target.id));
    const pos = Math.max(0, queue.findIndex((q) => q.id === target.id));
    return { next: { currentParticipantId: target.id, queuePosition: pos, playback: "RUNNING", isPaused: false } };
  });
}

export async function presentationReplay() {
  return runCommand(async () => {
    const state = await ensurePresentationState();
    if (!state.currentParticipantId) return { message: "no_current" };
    return { next: { playback: "RUNNING", isPaused: false } };
  });
}

export async function presentationSkip() {
  return runCommand(async (tx) => {
    const state = await ensurePresentationState(tx);
    if (state.currentParticipantId) {
      await tx.update(participant).set({ presentationStatus: "SKIPPED" }).where(eq(participant.id, state.currentParticipantId));
    }
    // Move to the next queued participant.
    const upcoming = await getUpcomingQueue(tx);
    const nextOne = upcoming.find((q) => q.id !== state.currentParticipantId && q.presentationStatus === "QUEUED")
      ?? upcoming[0];
    if (!nextOne) {
      return { next: { currentParticipantId: null, queuePosition: 0, playback: "FINISHED", isPaused: true }, message: "queue_end" };
    }
    await tx.update(participant).set({ presentationStatus: "CURRENT" }).where(eq(participant.id, nextOne.id));
    const queue = await getQueue(tx);
    const pos = Math.max(0, queue.findIndex((q) => q.id === nextOne.id));
    return { next: { currentParticipantId: nextOne.id, queuePosition: pos, playback: "RUNNING", isPaused: false } };
  });
}

export async function presentationJump(participantId: string) {
  return runCommand(async (tx) => {
    const target = (await tx.select().from(participant).where(eq(participant.id, participantId)).limit(1))[0];
    requireRow(target, "participant_not_found");
    const state = await ensurePresentationState(tx);
    if (state.currentParticipantId && state.currentParticipantId !== participantId) {
      await tx.update(participant).set({ presentationStatus: "PRESENTED" }).where(eq(participant.id, state.currentParticipantId));
    }
    // Un-skip when jumping to a skipped participant.
    await tx.update(participant).set({ presentationStatus: "CURRENT" }).where(eq(participant.id, participantId));
    const queue = await getQueue(tx);
    const pos = Math.max(0, queue.findIndex((q) => q.id === participantId));
    return { next: { currentParticipantId: participantId, queuePosition: pos, playback: "RUNNING", isPaused: false } };
  });
}

export async function presentationRestartQueue() {
  return runCommand(async (tx) => {
    await tx.update(participant).set({ presentationStatus: "QUEUED" }).where(inArray(participant.presentationStatus, ["QUEUED", "CURRENT", "PRESENTED", "SKIPPED"]));
    return { next: { currentParticipantId: null, queuePosition: 0, playback: "IDLE", isPaused: true } };
  });
}

export type PresentationField = keyof Omit<PresentationSettings, "displaySettings"> | "displaySettings";

const DURATION_LIMITS: Array<[string, number, number]> = [
  ["childhoodDurationMs", 300, 30_000],
  ["smokeDurationMs", 300, 30_000],
  ["adultDurationMs", 1000, 120_000],
  ["nameRevealDurationMs", 200, 20_000],
  ["transitionDurationMs", 100, 20_000],
];

/** Shared validation for settings values (used by draft recording + saving). */
export function validateSettingValue(key: string, value: unknown): string | null {
  const limit = DURATION_LIMITS.find(([f]) => f === key);
  if (limit) {
    if (typeof value === "number" && Number.isFinite(value) && value >= limit[1] && value <= limit[2]) {
      return null;
    }
    return `"${key}" must be a number between ${limit[1]} and ${limit[2]} ms.`;
  }
  if (key === "mode") return value === "AUTOMATIC" || value === "MANUAL" ? null : "Mode must be AUTOMATIC or MANUAL.";
  if (key === "autoPlay" || key === "loopAfterQueueEnd") {
    return typeof value === "boolean" ? null : `${key} must be a boolean.`;
  }
  if (key === "displaySettings") {
    return value && typeof value === "object" && !Array.isArray(value) ? null : "displaySettings must be an object.";
  }
  return "Unknown settings field.";
}

/** Validate + apply presentation settings (used by admin settings save). */
export async function presentationUpdateSettings(patch: Partial<PresentationSettings>, tx?: Tx) {
  const db = resolveDb(tx);
  const state = await ensurePresentationState(tx);
  const set: Partial<PresentationStateRow> = { updatedAt: new Date() };
  for (const [field, min, max] of DURATION_LIMITS) {
    const val = (patch as Record<string, unknown>)[field];
    if (typeof val === "number") {
      if (!Number.isFinite(val) || val < min || val > max) throw new Error(`Invalid ${field}`);
      (set as Record<string, unknown>)[field] = Math.round(val);
    }
  }
  if (patch.mode === "AUTOMATIC" || patch.mode === "MANUAL") set.mode = patch.mode;
  if (typeof patch.autoPlay === "boolean") set.autoPlay = patch.autoPlay;
  if (typeof patch.loopAfterQueueEnd === "boolean") set.loopAfterQueueEnd = patch.loopAfterQueueEnd;
  if (patch.displaySettings) set.displaySettings = patch.displaySettings;
  const [updated] = await db
    .update(presentationState)
    .set({ ...set, sequenceVersion: (state.sequenceVersion ?? 0) + 1 })
    .where(eq(presentationState.id, "singleton"))
    .returning();
  return updated;
}

/* ------------------------------------------------------------------ */
/* Snapshots (control room + projector)                                */
/* ------------------------------------------------------------------ */

export interface ControlRoomSnapshot {
  state: {
    currentParticipantId: string | null;
    queuePosition: number;
    playback: PresentationStateRow["playback"];
    mode: PresentationStateRow["mode"];
    autoPlay: boolean;
    isPaused: boolean;
    loopAfterQueueEnd: boolean;
    sequenceVersion: number;
  };
  settings: PresentationSettings;
  current: { id: string; fullName: string; graduationThumb: string | null; childhoodThumb: string | null } | null;
  next: { id: string; fullName: string; graduationThumb: string | null } | null;
  queue: Array<{ id: string; fullName: string; presentationStatus: string; presentationOrder: number | null; graduationThumb: string | null }>;
  upcomingCount: number;
  queueEnded: boolean;
}

export async function getControlRoomSnapshot(): Promise<ControlRoomSnapshot> {
  const db = getDb();
  const state = await ensurePresentationState();
  const queue = await getQueue();
  const upcoming = await getUpcomingQueue();

  const queueIds = queue.map((q) => q.id);
  const queueRows = queueIds.length
    ? await db
        .select({ id: participant.id, graduationImageId: participant.graduationImageId, childhoodImageId: participant.childhoodImageId })
        .from(participant)
        .where(inArray(participant.id, queueIds))
    : [];
  const gradByPid = new Map(queueRows.map((r) => [r.id, r.graduationImageId]));
  const childByPid = new Map(queueRows.map((r) => [r.id, r.childhoodImageId]));
  const assetIds = [...new Set([...gradByPid.values(), ...childByPid.values()].filter((x): x is string => Boolean(x)))];
  const assets = assetIds.length
    ? await db.select({ id: imageAsset.id, publicUrl: imageAsset.publicUrl }).from(imageAsset).where(inArray(imageAsset.id, assetIds))
    : [];
  const urlById = new Map(assets.map((a) => [a.id, a.publicUrl]));

  const currentIdx = state.currentParticipantId ? queue.findIndex((q) => q.id === state.currentParticipantId) : -1;
  const current = currentIdx >= 0
    ? {
        id: queue[currentIdx]!.id,
        fullName: queue[currentIdx]!.fullName,
        graduationThumb: urlById.get(gradByPid.get(queue[currentIdx]!.id) ?? "") ?? null,
        childhoodThumb: urlById.get(childByPid.get(queue[currentIdx]!.id) ?? "") ?? null,
      }
    : null;

  const nextEntry = currentIdx >= 0 ? queue.slice(currentIdx + 1).find((q) => q.presentationStatus !== "PRESENTED") : null;

  return {
    state: {
      currentParticipantId: state.currentParticipantId,
      queuePosition: state.queuePosition,
      playback: state.playback,
      mode: state.mode,
      autoPlay: state.autoPlay,
      isPaused: state.isPaused,
      loopAfterQueueEnd: state.loopAfterQueueEnd,
      sequenceVersion: state.sequenceVersion,
    },
    settings: settingsFromState(state),
    current,
    next: nextEntry
      ? {
          id: nextEntry.id,
          fullName: nextEntry.fullName,
          graduationThumb: urlById.get(gradByPid.get(nextEntry.id) ?? "") ?? null,
        }
      : null,
    queue: queue.map((q) => ({
      id: q.id,
      fullName: q.fullName,
      presentationStatus: q.presentationStatus,
      presentationOrder: q.presentationOrder,
      graduationThumb: urlById.get(gradByPid.get(q.id) ?? "") ?? null,
    })),
    upcomingCount: upcoming.length,
    queueEnded: state.playback === "FINISHED" || (state.playback === "IDLE" && queue.length === 0),
  };
}
