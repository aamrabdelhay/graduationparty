import { db } from "@/db";
import { drafts, participants, Draft, Participant } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";

export type DraftField =
  | "fullName"
  | "childhoodImageUrl"
  | "adultImageUrl"
  | "skipped"
  | "displayOrder";

const DRAFTABLE: DraftField[] = [
  "fullName",
  "childhoodImageUrl",
  "adultImageUrl",
  "skipped",
  "displayOrder",
];

function currentValueOf(p: Participant, field: DraftField): string | null {
  const v = p[field];
  if (v === null || v === undefined) return null;
  return String(v);
}

/** Create or update a server-side draft change for the session. */
export async function upsertDraft(
  sessionId: string,
  participantId: string,
  field: DraftField,
  newValue: string | null,
) {
  if (!DRAFTABLE.includes(field)) throw new Error("حقل غير قابل للتعديل");
  const prow = await db
    .select()
    .from(participants)
    .where(eq(participants.id, participantId))
    .limit(1);
  const p = prow[0];
  if (!p) throw new Error("المشارك غير موجود");

  const currentVal = currentValueOf(p, field);
  const existing = await db
    .select()
    .from(drafts)
    .where(
      and(
        eq(drafts.sessionId, sessionId),
        eq(drafts.participantId, participantId),
        eq(drafts.field, field),
        eq(drafts.status, "OPEN"),
      ),
    )
    .limit(1);

  if (newValue === currentVal) {
    if (existing[0]) await db.delete(drafts).where(eq(drafts.id, existing[0].id));
    return null;
  }

  if (existing[0]) {
    const updated = await db
      .update(drafts)
      .set({ newValue, updatedAt: new Date() })
      .where(eq(drafts.id, existing[0].id))
      .returning();
    return updated[0];
  }

  const created = await db
    .insert(drafts)
    .values({
      sessionId,
      participantId,
      field,
      previousValue: currentVal,
      newValue,
      expectedVersion: p.version,
      status: "OPEN",
    })
    .returning();
  return created[0];
}

export async function listOpenDrafts(sessionId: string) {
  return db
    .select({
      draft: drafts,
      participantName: participants.fullName,
    })
    .from(drafts)
    .leftJoin(participants, eq(drafts.participantId, participants.id))
    .where(and(eq(drafts.sessionId, sessionId), eq(drafts.status, "OPEN")))
    .orderBy(asc(drafts.updatedAt));
}

export interface DraftConflict {
  draftId: string;
  participantId: string;
  participantName: string;
  field: string;
  dbValue: string | null;
  yourValue: string | null;
}

async function regenerateGraduation(p: Participant, adultUrl: string) {
  await db
    .update(participants)
    .set({ gradImageStatus: "PROCESSING", updatedAt: new Date() })
    .where(eq(participants.id, p.id));
  try {
    const { generateGraduationImage, loadImageBuffer, storeImage } = await import(
      "@/lib/media"
    );
    const buf = await loadImageBuffer(adultUrl);
    const out = await generateGraduationImage(buf);
    const url = await storeImage(out, "generated");
    await db
      .update(participants)
      .set({
        graduationImageUrl: url,
        gradImageStatus: "READY",
        aiError: null,
        updatedAt: new Date(),
      })
      .where(eq(participants.id, p.id));
  } catch (e) {
    await db
      .update(participants)
      .set({
        gradImageStatus: "FAILED",
        aiError: e instanceof Error ? e.message : "فشل غير معروف",
        updatedAt: new Date(),
      })
      .where(eq(participants.id, p.id));
  }
}

/** Apply all OPEN drafts of the session with optimistic-concurrency checks. */
export async function saveDrafts(
  sessionId: string,
  forceParticipantIds: string[] = [],
): Promise<{ applied: number; conflicts: DraftConflict[] }> {
  const open = await db
    .select()
    .from(drafts)
    .where(and(eq(drafts.sessionId, sessionId), eq(drafts.status, "OPEN")));

  const conflicts: DraftConflict[] = [];
  let applied = 0;

  const byParticipant = new Map<string, typeof open>();
  for (const d of open) {
    const arr = byParticipant.get(d.participantId) ?? [];
    arr.push(d);
    byParticipant.set(d.participantId, arr);
  }

  for (const [participantId, list] of byParticipant) {
    const prow = await db
      .select()
      .from(participants)
      .where(eq(participants.id, participantId))
      .limit(1);
    const p = prow[0];
    if (!p) {
      for (const d of list) {
        await db
          .update(drafts)
          .set({ status: "DISCARDED", acknowledged: true, updatedAt: new Date() })
          .where(eq(drafts.id, d.id));
      }
      continue;
    }

    const forced = forceParticipantIds.includes(participantId);
    const stale = list.filter((d) => d.expectedVersion !== p.version);
    if (!forced && stale.length > 0) {
      for (const d of stale) {
        conflicts.push({
          draftId: d.id,
          participantId,
          participantName: p.fullName,
          field: d.field,
          dbValue: currentValueOf(p, d.field as DraftField),
          yourValue: d.newValue,
        });
      }
      continue;
    }

    const patch: Partial<typeof participants.$inferInsert> = {
      updatedAt: new Date(),
      version: p.version + 1,
    };
    const oldImages: string[] = [];
    let adultReplacement: string | null = null;

    for (const d of list) {
      const field = d.field as DraftField;
      const prev = currentValueOf(p, field);
      if (field === "fullName") patch.fullName = d.newValue ?? p.fullName;
      if (field === "skipped") patch.skipped = d.newValue === "true";
      if (field === "displayOrder")
        patch.displayOrder = Number(d.newValue ?? p.displayOrder);
      if (field === "childhoodImageUrl") {
        patch.childhoodImageUrl = d.newValue;
        if (prev && prev !== d.newValue) oldImages.push(prev);
      }
      if (field === "adultImageUrl") {
        patch.adultImageUrl = d.newValue;
        patch.gradImageStatus = "PENDING";
        adultReplacement = d.newValue;
      }
    }

    await db.update(participants).set(patch).where(eq(participants.id, p.id));
    for (const d of list) {
      await db
        .update(drafts)
        .set({ status: "SAVED", acknowledged: true, updatedAt: new Date() })
        .where(eq(drafts.id, d.id));
      applied += 1;
    }

    for (const url of oldImages) {
      try {
        const { deleteImageByUrl } = await import("@/lib/media");
        await deleteImageByUrl(url);
      } catch {
        // Image cleanup is best-effort and must not break the database save.
      }
    }
    if (adultReplacement) {
      const fresh = { ...p, ...patch } as Participant;
      await regenerateGraduation(fresh, adultReplacement);
    }
  }

  return { applied, conflicts };
}

export async function discardOpenDrafts(sessionId: string) {
  const res = await db
    .update(drafts)
    .set({ status: "DISCARDED", acknowledged: false, updatedAt: new Date() })
    .where(and(eq(drafts.sessionId, sessionId), eq(drafts.status, "OPEN")))
    .returning({ id: drafts.id });
  return res.length;
}

export async function listUnacknowledgedDiscarded() {
  return db
    .select({ draft: drafts, participantName: participants.fullName })
    .from(drafts)
    .leftJoin(participants, eq(drafts.participantId, participants.id))
    .where(and(eq(drafts.status, "DISCARDED"), eq(drafts.acknowledged, false)))
    .orderBy(asc(drafts.updatedAt));
}

export async function acknowledgeDiscarded() {
  await db
    .update(drafts)
    .set({ acknowledged: true, updatedAt: new Date() })
    .where(and(eq(drafts.status, "DISCARDED"), eq(drafts.acknowledged, false)));
}

export async function restoreDiscarded(sessionId: string, draftIds: string[]) {
  let restored = 0;
  for (const id of draftIds) {
    const rows = await db.select().from(drafts).where(eq(drafts.id, id)).limit(1);
    const d = rows[0];
    if (!d || d.status !== "DISCARDED") continue;
    const prow = await db
      .select()
      .from(participants)
      .where(eq(participants.id, d.participantId))
      .limit(1);
    const p = prow[0];
    if (!p) continue;
    await db
      .update(drafts)
      .set({
        status: "OPEN",
        acknowledged: true,
        sessionId,
        previousValue: currentValueOf(p, d.field as DraftField),
        expectedVersion: p.version,
        updatedAt: new Date(),
      })
      .where(eq(drafts.id, d.id));
    restored += 1;
  }
  return restored;
}

export type DraftWithName = { draft: Draft; participantName: string | null };
