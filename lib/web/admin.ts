"use client";

import { api } from "@/lib/web/api";

export interface DraftChangeSummary {
  draftId: string | null;
  changeCount: number;
  changes: Array<{
    id: string;
    participantId: string | null;
    participantName: string | null;
    field: string;
    previousValue: unknown;
    newValue: unknown;
    createdAt: string;
  }>;
}

export interface DraftConflict {
  participantId: string;
  fullName: string;
  expectedVersion: number;
  actualVersion: number;
}

export interface SaveDraftResponse {
  saved: boolean;
  conflicts?: DraftConflict[];
  appliedParticipantIds: string[];
  deletedParticipantIds: string[];
  queueReordered: boolean;
  settingsChanged: boolean;
  stateVersion?: number;
}

export function fetchDraftSummary(): Promise<DraftChangeSummary> {
  return api.get<DraftChangeSummary>("/api/admin/drafts");
}

export function saveAllDrafts(keepLocal: string[] = [], keepDb: string[] = []): Promise<SaveDraftResponse> {
  return api.post<SaveDraftResponse>("/api/admin/drafts/save", { keepLocal, keepDb });
}

export function discardAllDrafts(notify = false): Promise<{ ok: boolean; discarded: number }> {
  return api.post<{ ok: boolean; discarded: number }>("/api/admin/drafts/discard", { notifyDiscarded: notify });
}

/* ---------- API shapes (kept client-safe, no server imports) ---------- */

export interface ImageRef {
  id: string;
  publicUrl: string;
  kind: "CHILDHOOD" | "ADULT" | "GRADUATION";
  mimeType: string;
  width: number;
  height: number;
}

export interface ParticipantListItem {
  id: string;
  fullName: string;
  groupId: string | null;
  groupNumber: number | null;
  groupPosition: number | null;
  submissionType: "INDIVIDUAL" | "GROUP";
  submittedAt: string;
  aiStatus: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  presentationStatus: "QUEUED" | "CURRENT" | "PRESENTED" | "SKIPPED";
  presentationOrder: number | null;
  source: "PUBLIC" | "ADMIN";
  version: number;
  childhoodThumb: string | null;
  adultThumb: string | null;
  graduationThumb: string | null;
}

export interface ParticipantView {
  id: string;
  fullName: string;
  aiStatus: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  aiError: string | null;
  aiRetryCount: number;
  presentationStatus: "QUEUED" | "CURRENT" | "PRESENTED" | "SKIPPED";
  presentationOrder: number | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  submissionType: "INDIVIDUAL" | "GROUP";
  submittedAt: string;
  groupId: string | null;
  groupNumber: number | null;
  groupPosition: number | null;
  source: "PUBLIC" | "ADMIN";
  childhoodImage: ImageRef | null;
  adultImage: ImageRef | null;
  graduationImage: ImageRef | null;
}

export interface AdminStats {
  totalParticipants: number;
  totalGroups: number;
  individuals: number;
  groups: number;
  pendingAi: number;
  processingAi: number;
  failedAi: number;
  completedAi: number;
  queued: number;
  current: number;
  presented: number;
  skipped: number;
  totalImages: number;
}

export interface ControlRoomSnapshot {
  state: {
    currentParticipantId: string | null;
    queuePosition: number;
    playback: "IDLE" | "RUNNING" | "PAUSED" | "FINISHED";
    mode: "AUTOMATIC" | "MANUAL";
    autoPlay: boolean;
    isPaused: boolean;
    loopAfterQueueEnd: boolean;
    sequenceVersion: number;
  };
  settings: {
    mode: "AUTOMATIC" | "MANUAL";
    autoPlay: boolean;
    loopAfterQueueEnd: boolean;
    childhoodDurationMs: number;
    smokeDurationMs: number;
    adultDurationMs: number;
    nameRevealDurationMs: number;
    transitionDurationMs: number;
    displaySettings: Record<string, unknown>;
  };
  current: { id: string; fullName: string; graduationThumb: string | null; childhoodThumb: string | null } | null;
  next: { id: string; fullName: string; graduationThumb: string | null } | null;
  queue: Array<{
    id: string;
    fullName: string;
    presentationStatus: string;
    presentationOrder: number | null;
    graduationThumb: string | null;
  }>;
  upcomingCount: number;
  queueEnded: boolean;
}
