"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  discardAllDrafts,
  fetchDraftSummary,
  saveAllDrafts,
  type DraftChangeSummary,
  type DraftConflict,
} from "@/lib/web/admin";
import { ApiError } from "@/lib/web/api";
import { Button, Modal } from "@/components/ui";

export interface DraftResolution {
  keepLocal: string[];
  keepDb: string[];
}

export interface DraftContextValue {
  summary: DraftChangeSummary | null;
  refresh: () => Promise<void>;
  save: () => Promise<{ ok: boolean; resolved?: boolean }>;
  /** Discard all local changes; optionally notify (logout). */
  discard: (notify?: boolean) => Promise<void>;
  busy: boolean;
  error: string | null;
  clearError: () => void;
}

const DraftContext = createContext<DraftContextValue | null>(null);

export function useDraftContext(): DraftContextValue {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error("useDraftContext must be used inside DraftProvider");
  return ctx;
}

export function DraftProvider({ children }: { children: ReactNode }) {
  const [summary, setSummary] = useState<DraftChangeSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<DraftConflict[] | null>(null);
  const [resolution, setResolution] = useState<Record<string, "keepDb" | "keepLocal">>({});
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const s = await fetchDraftSummary();
      if (mounted.current) setSummary(s);
    } catch {
      if (mounted.current) setSummary((prev) => prev ?? { draftId: null, changeCount: 0, changes: [] });
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  const save = useCallback(async (): Promise<{ ok: boolean; resolved?: boolean }> => {
    setBusy(true);
    setError(null);
    try {
      const res = await saveAllDrafts();
      if (res.saved) {
        setSummary({ draftId: null, changeCount: 0, changes: [] });
        return { ok: true };
      }
      if (res.conflicts?.length) {
        setConflicts(res.conflicts);
        setResolution({});
        return { ok: false, resolved: false };
      }
      return { ok: false };
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not save changes.";
      setError(message);
      return { ok: false };
    } finally {
      setBusy(false);
    }
  }, []);

  const resolveConflicts = async () => {
    if (!conflicts) return;
    setBusy(true);
    const keepLocal: string[] = [];
    const keepDb: string[] = [];
    for (const c of conflicts) {
      if (resolution[c.participantId] === "keepLocal") keepLocal.push(c.participantId);
      else if (resolution[c.participantId] === "keepDb") keepDb.push(c.participantId);
    }
    try {
      const res = await saveAllDrafts(keepLocal, keepDb);
      if (res.saved) {
        setSummary({ draftId: null, changeCount: 0, changes: [] });
        setConflicts(null);
        window.location.reload();
        return;
      }
      if (res.conflicts?.length) {
        setConflicts(res.conflicts);
      } else {
        setConflicts(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save changes.");
    } finally {
      setBusy(false);
    }
  };

  const discard = useCallback(async (notify = false) => {
    setBusy(true);
    setError(null);
    try {
      await discardAllDrafts(notify);
      setSummary({ draftId: null, changeCount: 0, changes: [] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not discard changes.");
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <DraftContext.Provider value={{ summary, refresh, save, discard, busy, error, clearError: () => setError(null) }}>
      {children}

      {error ? (
        <div className="fixed bottom-4 right-4 z-[60] max-w-sm">
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-white p-4 shadow-2xl">
            <p className="flex-1 text-sm text-red-800">{error}</p>
            <button onClick={() => setError(null)} aria-label="Dismiss error" className="text-slate-400 hover:text-slate-700">
              ✕
            </button>
          </div>
        </div>
      ) : null}

      {conflicts ? (
        <Modal open onClose={() => setConflicts(null)} title="Conflicting changes detected">
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-slate-700">
              Another session changed the same participants while you were editing. Choose what to keep for each one — no changes
              are overwritten silently.
            </p>
            <div className="space-y-3">
              {conflicts.map((c) => (
                <div key={c.participantId} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-ink-900">{c.fullName}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {(["keepLocal", "keepDb"] as const).map((option) => (
                      <label
                        key={option}
                        className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 ${
                          resolution[c.participantId] === option ? "border-ink-900 bg-cream-100" : "border-slate-200"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`conflict-${c.participantId}`}
                          checked={resolution[c.participantId] === option}
                          onChange={() => setResolution((r) => ({ ...r, [c.participantId]: option }))}
                          className="accent-gold-600"
                        />
                        {option === "keepLocal" ? "Keep my edits" : "Keep database version"}
                      </label>
                    ))}
                    {!resolution[c.participantId] ? (
                      <span className="self-center text-slate-400">— pick one to continue saving</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConflicts(null)} disabled={busy}>
                Decide later
              </Button>
              <Button onClick={() => void resolveConflicts()} loading={busy} disabled={conflicts.some((c) => !resolution[c.participantId])}>
                Save with my choices
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </DraftContext.Provider>
  );
}
