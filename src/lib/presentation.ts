import { EventEmitter } from "events";
import { db } from "@/db";
import { displayTokens, participants, presentationState } from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import crypto from "crypto";

/* ------------------------------ Event bus ------------------------------ */

const g = globalThis as typeof globalThis & {
  __cuPresentationBus?: EventEmitter;
};

export const bus =
  g.__cuPresentationBus ?? (g.__cuPresentationBus = new EventEmitter());
bus.setMaxListeners(200);

/* ------------------------------ State row ------------------------------ */

export async function ensureState() {
  const rows = await db
    .select()
    .from(presentationState)
    .where(eq(presentationState.id, 1))
    .limit(1);
  if (rows[0]) return rows[0];
  await db
    .insert(presentationState)
    .values({ id: 1 })
    .onConflictDoNothing({ target: presentationState.id });
  const again = await db
    .select()
    .from(presentationState)
    .where(eq(presentationState.id, 1))
    .limit(1);
  return again[0]!;
}

export async function getQueue() {
  return db
    .select()
    .from(participants)
    .where(eq(participants.skipped, false))
    .orderBy(asc(participants.displayOrder), asc(participants.submittedAt));
}

/* ------------------------- Minimal public snapshot ------------------------ */

export async function publicSnapshot() {
  const state = await ensureState();
  let participant: {
    id: string;
    name: string;
    childhoodImageUrl: string | null;
    graduationImageUrl: string | null;
  } | null = null;

  if (state.currentParticipantId) {
    const rows = await db
      .select()
      .from(participants)
      .where(eq(participants.id, state.currentParticipantId))
      .limit(1);
    const p = rows[0];
    if (p) {
      participant = {
        id: p.id,
        name: p.fullName,
        childhoodImageUrl: p.childhoodImageUrl,
        graduationImageUrl: p.graduationImageUrl ?? p.adultImageUrl,
      };
    }
  }

  return {
    status: state.status,
    isPaused: state.isPaused,
    playbackMode: state.playbackMode,
    queuePosition: state.queuePosition,
    sequenceVersion: state.sequenceVersion,
    phaseStartedAt: state.phaseStartedAt?.toISOString() ?? null,
    serverTime: new Date().toISOString(),
    childhoodDuration: state.childhoodDuration,
    smokeDuration: state.smokeDuration,
    adultDuration: state.adultDuration,
    nameAnimationDuration: state.nameAnimationDuration,
    participant,
  };
}

export type PublicSnapshot = Awaited<ReturnType<typeof publicSnapshot>>;

export async function broadcast() {
  const snap = await publicSnapshot();
  bus.emit("presentation", snap);
  return snap;
}

/* ------------------------------- Actions ------------------------------- */

export type PresentationAction =
  | "start"
  | "pause"
  | "resume"
  | "next"
  | "previous"
  | "skip"
  | "restart"
  | "replay"
  | "jump"
  | "timings"
  | "mode"
  | "stop";

export async function applyAction(
  action: PresentationAction,
  payload: Record<string, unknown> = {},
) {
  const state = await ensureState();
  const queue = await getQueue();
  const now = new Date();

  const patch: Partial<typeof presentationState.$inferInsert> = {
    updatedAt: now,
  };
  let bumpSequence = false;

  const currentIndex = state.currentParticipantId
    ? queue.findIndex((p) => p.id === state.currentParticipantId)
    : -1;

  const goTo = async (idx: number) => {
    if (idx < 0) idx = 0;
    if (idx >= queue.length) {
      patch.status = "FINISHED";
      patch.currentParticipantId = null;
      patch.nextParticipantId = null;
      patch.queuePosition = queue.length;
      patch.isPaused = false;
    } else {
      const target = queue[idx];
      patch.status = "RUNNING";
      patch.currentParticipantId = target.id;
      patch.queuePosition = idx;
      patch.nextParticipantId = queue[idx + 1]?.id ?? null;
      patch.isPaused = false;
    }
    patch.phaseStartedAt = now;
    bumpSequence = true;
  };

  switch (action) {
    case "start":
    case "restart":
      await goTo(0);
      break;
    case "stop":
      patch.status = "IDLE";
      patch.currentParticipantId = null;
      patch.nextParticipantId = null;
      patch.queuePosition = 0;
      patch.isPaused = false;
      bumpSequence = true;
      break;
    case "pause":
      patch.isPaused = true;
      break;
    case "resume":
      patch.isPaused = false;
      patch.phaseStartedAt = now;
      bumpSequence = true;
      break;
    case "next":
      if (queue.length === 0) break;
      await goTo(currentIndex === -1 ? state.queuePosition + 1 : currentIndex + 1);
      break;
    case "previous":
      if (queue.length === 0) break;
      await goTo(currentIndex <= 0 ? 0 : currentIndex - 1);
      break;
    case "replay":
      patch.phaseStartedAt = now;
      patch.isPaused = false;
      bumpSequence = true;
      break;
    case "jump": {
      const id = String(payload.participantId ?? "");
      const idx = queue.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error("المشارك غير موجود في قائمة الانتظار");
      await goTo(idx);
      break;
    }
    case "skip": {
      const id = String(payload.participantId ?? state.currentParticipantId ?? "");
      if (!id) throw new Error("لا يوجد مشارك لتخطيه");
      const idxOld = queue.findIndex((p) => p.id === id);
      await db
        .update(participants)
        .set({ skipped: true, updatedAt: now })
        .where(eq(participants.id, id));
      const fresh = await getQueue();
      if (id === state.currentParticipantId) {
        if (fresh.length === 0 || idxOld >= fresh.length) {
          // Skipped the last remaining participant -> the show is over.
          patch.status = "FINISHED";
          patch.currentParticipantId = null;
          patch.nextParticipantId = null;
          patch.queuePosition = fresh.length;
          patch.isPaused = false;
          patch.phaseStartedAt = now;
        } else {
          const nextIdx = Math.min(Math.max(idxOld, 0), fresh.length - 1);
          patch.status = "RUNNING";
          patch.currentParticipantId = fresh[nextIdx].id;
          patch.queuePosition = nextIdx;
          patch.nextParticipantId = fresh[nextIdx + 1]?.id ?? null;
          patch.phaseStartedAt = now;
        }
        bumpSequence = true;
      } else {
        const curIdx = fresh.findIndex((p) => p.id === state.currentParticipantId);
        patch.queuePosition = Math.max(curIdx, 0);
        patch.nextParticipantId =
          curIdx >= 0 ? fresh[curIdx + 1]?.id ?? null : fresh[0]?.id ?? null;
      }
      break;
    }
    case "timings": {
      const num = (v: unknown, d: number) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 300 && n <= 60000 ? Math.round(n) : d;
      };
      patch.childhoodDuration = num(payload.childhoodDuration, state.childhoodDuration);
      patch.smokeDuration = num(payload.smokeDuration, state.smokeDuration);
      patch.adultDuration = num(payload.adultDuration, state.adultDuration);
      patch.nameAnimationDuration = num(
        payload.nameAnimationDuration,
        state.nameAnimationDuration,
      );
      bumpSequence = true;
      break;
    }
    case "mode": {
      const mode = payload.playbackMode === "auto" ? "auto" : "manual";
      patch.playbackMode = mode;
      break;
    }
  }

  if (bumpSequence) {
    patch.sequenceVersion = state.sequenceVersion + 1;
    patch.phaseStartedAt = patch.phaseStartedAt ?? now;
  }

  await db.update(presentationState).set(patch).where(eq(presentationState.id, 1));
  return broadcast();
}

/* ---------------------------- Display tokens ---------------------------- */

export async function validateDisplayToken(token: string | null | undefined) {
  if (!token) return false;
  const rows = await db
    .select({ id: displayTokens.id })
    .from(displayTokens)
    .where(and(eq(displayTokens.token, token), isNull(displayTokens.revokedAt)))
    .limit(1);
  return rows.length > 0;
}

export function newDisplayToken() {
  return crypto.randomBytes(20).toString("hex");
}
