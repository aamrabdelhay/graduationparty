/**
 * Reusable row-mapping helpers shared by admin + public read paths.
 * A "participant view" = participant + its images + group/submission summary.
 */
import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { imageAsset, participant, submission, group } from "@/db/schema";
import type { AiStatus, ImageKind, PresentationStatus } from "@/db/schema";

export interface ImageAssetInfo {
  id: string;
  kind: ImageKind;
  storageProvider: string;
  publicUrl: string;
  mimeType: string;
  fileSize: number;
  width: number;
  height: number;
  committed: boolean;
  createdAt: Date;
}

export interface ParticipantView {
  id: string;
  fullName: string;
  aiStatus: AiStatus;
  aiError: string | null;
  aiRetryCount: number;
  presentationStatus: PresentationStatus;
  presentationOrder: number | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  submissionType: "INDIVIDUAL" | "GROUP";
  submittedAt: Date;
  groupId: string | null;
  groupNumber: number | null;
  groupPosition: number | null;
  source: "PUBLIC" | "ADMIN";
  childhoodImage: ImageAssetInfo | null;
  adultImage: ImageAssetInfo | null;
  graduationImage: ImageAssetInfo | null;
}

export function toImageAssetInfo(a: typeof imageAsset.$inferSelect): ImageAssetInfo {
  return {
    id: a.id,
    kind: a.kind,
    storageProvider: a.storageProvider,
    publicUrl: a.publicUrl,
    mimeType: a.mimeType,
    fileSize: a.fileSize,
    width: a.width,
    height: a.height,
    committed: a.committed,
    createdAt: a.createdAt,
  };
}

async function imageMap(ids: Array<string | null>): Promise<Map<string, ImageAssetInfo>> {
  const present = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const map = new Map<string, ImageAssetInfo>();
  if (present.length === 0) return map;
  const rows = await getDb().select().from(imageAsset).where(inArray(imageAsset.id, present));
  for (const r of rows) map.set(r.id, toImageAssetInfo(r));
  return map;
}

export async function getParticipantView(id: string): Promise<ParticipantView | null> {
  const db = getDb();
  const rows = await db
    .select({ p: participant, sub: submission, g: group })
    .from(participant)
    .innerJoin(submission, eq(participant.submissionId, submission.id))
    .leftJoin(group, eq(participant.groupId, group.id))
    .where(eq(participant.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const imgs = await imageMap([row.p.childhoodImageId, row.p.adultImageId, row.p.graduationImageId]);
  return {
    id: row.p.id,
    fullName: row.p.fullName,
    aiStatus: row.p.aiStatus,
    aiError: row.p.aiError,
    aiRetryCount: row.p.aiRetryCount,
    presentationStatus: row.p.presentationStatus,
    presentationOrder: row.p.presentationOrder,
    version: row.p.version,
    createdAt: row.p.createdAt,
    updatedAt: row.p.updatedAt,
    submissionType: row.sub.type,
    submittedAt: row.sub.submittedAt,
    groupId: row.p.groupId,
    groupNumber: row.g?.number ?? null,
    groupPosition: row.p.groupPosition,
    source: row.p.source,
    childhoodImage: row.p.childhoodImageId ? imgs.get(row.p.childhoodImageId) ?? null : null,
    adultImage: row.p.adultImageId ? imgs.get(row.p.adultImageId) ?? null : null,
    graduationImage: row.p.graduationImageId ? imgs.get(row.p.graduationImageId) ?? null : null,
  };
}

/** Row used by admin table + export + queue tooling (participant + submission + group joined). */
export interface ParticipantListItem {
  id: string;
  fullName: string;
  groupId: string | null;
  groupNumber: number | null;
  groupPosition: number | null;
  submissionType: "INDIVIDUAL" | "GROUP";
  submittedAt: Date;
  aiStatus: AiStatus;
  presentationStatus: PresentationStatus;
  presentationOrder: number | null;
  source: "PUBLIC" | "ADMIN";
  version: number;
  childhoodThumb: string | null;
  adultThumb: string | null;
  graduationThumb: string | null;
}

type JoinedRow = {
  p: typeof participant.$inferSelect;
  sub: typeof submission.$inferSelect;
  g: (typeof group.$inferSelect) | null;
};

async function fetchJoined(filter?: { search?: string }): Promise<JoinedRow[]> {
  const db = getDb();
  const conds = [];
  if (filter?.search) {
    const q = `%${filter.search.toLowerCase().replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
    conds.push(sql`lower(${participant.fullName}) like ${q} escape '\\'`);
  }
  const where = conds.length ? sql.join(conds, sql` and `) : undefined;
  return db
    .select({ p: participant, sub: submission, g: group })
    .from(participant)
    .innerJoin(submission, eq(participant.submissionId, submission.id))
    .leftJoin(group, eq(participant.groupId, group.id))
    .where(where)
    .orderBy(submission.submittedAt, participant.groupPosition ?? sql`0`);
}

export async function listParticipantViews(filter?: { search?: string }): Promise<ParticipantView[]> {
  const rows = await fetchJoined(filter);
  const allImageIds: string[] = [];
  for (const r of rows) {
    allImageIds.push(r.p.childhoodImageId, r.p.adultImageId);
    if (r.p.graduationImageId) allImageIds.push(r.p.graduationImageId);
  }
  const imgs = await imageMap(allImageIds);
  return rows.map((row) => ({
    id: row.p.id,
    fullName: row.p.fullName,
    aiStatus: row.p.aiStatus,
    aiError: row.p.aiError,
    aiRetryCount: row.p.aiRetryCount,
    presentationStatus: row.p.presentationStatus,
    presentationOrder: row.p.presentationOrder,
    version: row.p.version,
    createdAt: row.p.createdAt,
    updatedAt: row.p.updatedAt,
    submissionType: row.sub.type,
    submittedAt: row.sub.submittedAt,
    groupId: row.p.groupId,
    groupNumber: row.g?.number ?? null,
    groupPosition: row.p.groupPosition,
    source: row.p.source,
    childhoodImage: row.p.childhoodImageId ? imgs.get(row.p.childhoodImageId) ?? null : null,
    adultImage: row.p.adultImageId ? imgs.get(row.p.adultImageId) ?? null : null,
    graduationImage: row.p.graduationImageId ? imgs.get(row.p.graduationImageId) ?? null : null,
  }));
}

export async function listParticipantItems(filter?: { search?: string }): Promise<ParticipantListItem[]> {
  const rows = await fetchJoined(filter);
  const allImageIds: string[] = [];
  for (const r of rows) {
    allImageIds.push(r.p.childhoodImageId, r.p.adultImageId);
    if (r.p.graduationImageId) allImageIds.push(r.p.graduationImageId);
  }
  const imgs = await imageMap(allImageIds);
  const map = (id: string | null) => (id ? imgs.get(id)?.publicUrl ?? null : null);
  return rows.map((row) => ({
    id: row.p.id,
    fullName: row.p.fullName,
    groupId: row.p.groupId,
    groupNumber: row.g?.number ?? null,
    groupPosition: row.p.groupPosition,
    submissionType: row.sub.type,
    submittedAt: row.sub.submittedAt,
    aiStatus: row.p.aiStatus,
    presentationStatus: row.p.presentationStatus,
    presentationOrder: row.p.presentationOrder,
    source: row.p.source,
    version: row.p.version,
    childhoodThumb: map(row.p.childhoodImageId),
    adultThumb: map(row.p.adultImageId),
    graduationThumb: map(row.p.graduationImageId),
  }));
}

export interface GroupView {
  id: string;
  number: number;
  createdAt: Date;
  submissionId: string;
  submittedAt: Date;
  members: ParticipantListItem[];
}

export async function listGroupViews(): Promise<GroupView[]> {
  const db = getDb();
  const groups = await db.select().from(group).orderBy(group.number);
  if (groups.length === 0) return [];
  const groupIds = groups.map((g) => g.id);

  const subs = await db
    .select()
    .from(submission)
    .where(inArray(submission.groupId, groupIds));
  const subByGroup = new Map(subs.map((s) => [s.groupId, s]));

  const memberRows = await db
    .select({ p: participant, g: group })
    .from(participant)
    .innerJoin(group, eq(participant.groupId, group.id))
    .where(inArray(participant.groupId, groupIds))
    .orderBy(participant.groupPosition ?? sql`0`);

  const allImageIds: string[] = [];
  for (const r of memberRows) {
    allImageIds.push(r.p.childhoodImageId, r.p.adultImageId);
    if (r.p.graduationImageId) allImageIds.push(r.p.graduationImageId);
  }
  const imgs = await imageMap(allImageIds);
  const urlOf = (id: string | null) => (id ? imgs.get(id)?.publicUrl ?? null : null);

  const byGroup = new Map<string, GroupView>();
  for (const g of groups) {
    byGroup.set(g.id, {
      id: g.id,
      number: g.number,
      createdAt: g.createdAt,
      submissionId: subByGroup.get(g.id)?.id ?? "",
      submittedAt: subByGroup.get(g.id)?.submittedAt ?? g.createdAt,
      members: [],
    });
  }
  for (const r of memberRows) {
    const view = byGroup.get(r.p.groupId!);
    if (!view) continue;
    const sub = subByGroup.get(r.p.groupId!);
    view.members.push({
      id: r.p.id,
      fullName: r.p.fullName,
      groupId: r.p.groupId,
      groupNumber: r.g.number,
      groupPosition: r.p.groupPosition,
      submissionType: "GROUP",
      submittedAt: sub?.submittedAt ?? r.g.createdAt,
      aiStatus: r.p.aiStatus,
      presentationStatus: r.p.presentationStatus,
      presentationOrder: r.p.presentationOrder,
      source: r.p.source,
      version: r.p.version,
      childhoodThumb: urlOf(r.p.childhoodImageId),
      adultThumb: urlOf(r.p.adultImageId),
      graduationThumb: urlOf(r.p.graduationImageId),
    });
  }
  return [...byGroup.values()];
}
