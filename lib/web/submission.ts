"use client";

/** Public draft participant model (mirrors server ImageKind/AiStatus). */

export interface DraftImage {
  assetId: string;
  url: string;
  width?: number;
  height?: number;
}

export type AiState = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface DraftParticipant {
  localId: string;
  fullName: string;
  childhood: DraftImage | null;
  adult: DraftImage | null;
  graduation: DraftImage | null;
  aiStatus: AiState;
  aiError?: string | null;
}

export interface SubmissionDraft {
  version: 1;
  type: "individual" | "group";
  step: "participants" | "preview";
  participants: DraftParticipant[];
  updatedAt: string;
}

export const DRAFT_KEY = "gp-public-draft-v1";

export function newLocalId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyParticipant(): DraftParticipant {
  return {
    localId: newLocalId(),
    fullName: "",
    childhood: null,
    adult: null,
    graduation: null,
    aiStatus: "PENDING",
    aiError: null,
  };
}

export function saveDraft(draft: SubmissionDraft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }));
  } catch {
    /* storage may be unavailable — the in-memory state still works */
  }
}

export function loadDraft(): SubmissionDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SubmissionDraft;
    if (parsed?.version !== 1 || !Array.isArray(parsed.participants)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export async function deleteStagedAsset(assetId: string | null | undefined) {
  if (!assetId) return;
  try {
    await fetch(`/api/assets/${assetId}`, { method: "DELETE", credentials: "same-origin" });
  } catch {
    /* best effort — orphan cleanup runs server-side later */
  }
}
