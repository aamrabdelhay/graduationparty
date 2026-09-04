"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import ImagePicker from "@/components/ImagePicker";
import { useDraftContext } from "@/components/admin/DraftProvider";
import {
  Badge,
  Button,
  ConfirmDialog,
  InlineMessage,
  Spinner,
  aiStatusBadge,
  presentationStatusBadge,
} from "@/components/ui";
import { api, ApiError } from "@/lib/web/api";
import { groupLabel, formatDateTime } from "@/lib/format";
import type { ControlRoomSnapshot, ParticipantView } from "@/lib/web/admin";
import { deleteStagedAsset } from "@/lib/web/submission";

interface PendingImage {
  id: string;
  url: string;
}

export default function ParticipantDetail({ id }: { id: string }) {
  const draft = useDraftContext();
  const [view, setView] = useState<ParticipantView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmGroupDelete, setConfirmGroupDelete] = useState(false);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<Record<string, PendingImage>>({});
  const [aiBusy, setAiBusy] = useState(false);
  const [queueOrder, setQueueOrder] = useState<number | "">("");
  const [queueIds, setQueueIds] = useState<string[]>([]);
  const [genError, setGenError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ participant: ParticipantView }>(`/api/admin/participants/${id}`);
      setView(res.participant);
      setQueueOrder(res.participant.presentationOrder ?? "");
      try {
        const snap = await api.get<ControlRoomSnapshot>("/api/admin/presentation");
        setQueueIds(snap.queue.map((q) => q.id));
      } catch {
        setQueueIds([]);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingFor = useMemo(() => {
    const entries: Record<string, unknown> = {};
    for (const c of draft.summary?.changes ?? []) {
      if (c.participantId === id) entries[c.field] = c.newValue;
    }
    return entries;
  }, [draft.summary, id]);

  const hasPendingDelete = pendingFor["_delete"] === true;
  const pendingNameServer = typeof pendingFor["fullName"] === "string" ? (pendingFor["fullName"] as string) : null;

  const record = useCallback(
    async (field: string, newValue: unknown) => {
      await api.post("/api/admin/drafts", { participantId: id, field, newValue });
      await draft.refresh();
    },
    [id, draft],
  );

  const commitName = async (value: string) => {
    const name = value.trim().replace(/\s+/g, " ");
    setPendingName(name);
    setMessage(null);
    try {
      await record("fullName", name);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not save changes.");
      setPendingName(null);
    }
  };

  const replaceImage = async (field: "childhoodImageId" | "adultImageId" | "graduationImageId", img: { assetId: string; url: string }) => {
    setMessage(null);
    try {
      await record(field, img.assetId);
      setPendingImages((m) => ({ ...m, [field]: { id: img.assetId, url: img.url } }));
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not save changes.");
      void deleteStagedAsset(img.assetId);
    }
  };

  const removeGraduation = async () => {
    setMessage(null);
    try {
      await record("graduationImageId", null);
      setPendingImages((m) => {
        const next = { ...m };
        delete next.graduationImageId;
        return next;
      });
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not save changes.");
    }
  };

  const regenerateAi = async () => {
    setAiBusy(true);
    setGenError(null);
    setMessage(null);
    try {
      const res = await api.post<{ stagedAsset: { id: string; url: string } }>(`/api/admin/participants/${id}/ai`);
      setPendingImages((m) => ({ ...m, graduationImageId: { id: res.stagedAsset.id, url: res.stagedAsset.url } }));
      await draft.refresh();
    } catch (err) {
      setGenError(err instanceof ApiError ? err.message : "Graduation cap generation failed. You can retry.");
    } finally {
      setAiBusy(false);
    }
  };

  const markDelete = async () => {
    try {
      await record("_delete", true);
      setConfirmDelete(false);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not save changes.");
    }
  };

  const undoDelete = async () => {
    try {
      await record("_delete", false);
    } catch {
      /* ignore */
    }
  };

  const markGroupDelete = async () => {
    try {
      await api.post("/api/admin/drafts", { field: "group.delete", newValue: view!.groupId });
      await draft.refresh();
      setConfirmGroupDelete(false);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not save changes.");
    }
  };

  const changePosition = async (newIndex: number) => {
    if (!view) return;
    const list = [...queueIds];
    const current = list.findIndex((q) => q === view.id);
    if (current < 0) return;
    const [moved] = list.splice(current, 1);
    const clamped = Math.max(0, Math.min(list.length, newIndex));
    list.splice(clamped, 0, moved);
    try {
      await api.post("/api/admin/drafts", { field: "queue.presentationOrder", newValue: list });
      await draft.refresh();
      setQueueOrder(clamped + 1);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not save changes.");
    }
  };

  if (notFound) {
    return (
      <div className="space-y-4">
        <InlineMessage tone="info">This participant no longer exists.</InlineMessage>
        <Link href="/admin/participants" className="text-sm font-semibold text-ink-900 underline underline-offset-4">
          Back to participants
        </Link>
      </div>
    );
  }
  if (!view) {
    return <div className="skeleton h-[520px] rounded-xl" />;
  }

  const nameNow = pendingName ?? pendingNameServer ?? view.fullName;
  const img = (field: "childhoodImageId" | "adultImageId" | "graduationImageId") =>
    pendingImages[field] ?? (view[field as never] ? null : null);

  const imageValue = (field: "childhoodImageId" | "adultImageId" | "graduationImageId") => {
    const pend = pendingImages[field];
    if (pend) return pend;
    const src = view[field === "childhoodImageId" ? "childhoodImage" : field === "adultImageId" ? "adultImage" : "graduationImage"];
    return src ? { id: src.id, url: src.publicUrl } : null;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/participants" className="text-xs font-semibold text-slate-500 hover:text-ink-900">
            ← Participants
          </Link>
          <h1 className="font-display mt-1 text-2xl font-semibold tracking-tight text-ink-950">{nameNow}</h1>
        </div>
        <div className="flex items-center gap-2">
          {view.groupId ? (
            <Badge tone="gold">{view.groupNumber != null ? groupLabel(view.groupNumber) : "Group member"}</Badge>
          ) : (
            <Badge>Individual</Badge>
          )}
          <Badge tone={aiStatusBadge(view.aiStatus).tone}>{aiStatusBadge(view.aiStatus).label}</Badge>
          <Badge tone={presentationStatusBadge(view.presentationStatus).tone}>
            {presentationStatusBadge(view.presentationStatus).label}
          </Badge>
          <Badge tone="neutral">v{view.version}</Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Photos column */}
        <div className="space-y-5">
          <ImageBlock
            label="Childhood photo"
            img={imageValue("childhoodImageId")}
            onChange={(v) => void replaceImage("childhoodImageId", v)}
            kind="CHILDHOOD"
            pending={Boolean(pendingImages.childhoodImageId || pendingFor["childhoodImageId"] != null && pendingFor["childhoodImageId"] !== view.childhoodImage?.id)}
          />
          <ImageBlock
            label="Adult original"
            img={imageValue("adultImageId")}
            onChange={(v) => void replaceImage("adultImageId", v)}
            kind="ADULT"
            pending={Boolean(pendingImages.adultImageId || pendingFor["adultImageId"] != null && pendingFor["adultImageId"] !== view.adultImage?.id)}
          />
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink-900">Graduation photo</p>
              {view.graduationImage || imageValue("graduationImageId") ? (
                <Button variant="ghost" size="sm" onClick={() => void removeGraduation()} disabled={Boolean(pendingFor["graduationImageId"] == null && view.graduationImage == null)}>
                  Remove
                </Button>
              ) : null}
            </div>
            <ImageBlock
              label="Generated"
              img={imageValue("graduationImageId")}
              onChange={(v) => void replaceImage("graduationImageId", v)}
              kind="GRADUATION"
              pending={Boolean(pendingImages.graduationImageId || pendingFor["graduationImageId"] != null)}
            />
            <div className="mt-3 space-y-2">
              <Button className="w-full justify-center" size="sm" onClick={() => void regenerateAi()} loading={aiBusy} disabled={!view.adultImage}>
                Retry AI Generation
              </Button>
              {genError ? <p className="text-xs text-red-700">{genError}</p> : null}
              <p className="text-[11px] leading-relaxed text-slate-500">
                Generates a fresh cap photo from the adult original. The result becomes an unsaved change — save it to apply.
              </p>
            </div>
          </div>
        </div>

        {/* Info column */}
        <div className="space-y-5">
          {hasPendingDelete ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm font-medium text-red-800">Marked for deletion — this happens when you save your changes.</p>
              <Button variant="secondary" size="sm" onClick={() => void undoDelete()}>
                Undo
              </Button>
            </div>
          ) : null}
          {view.groupId && !hasPendingDelete ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm text-amber-900">
                Member of a group submission. Deleting the whole group removes every member and their photos.
              </p>
              <Button variant="secondary" size="sm" onClick={() => setConfirmGroupDelete(true)}>
                Delete entire group
              </Button>
            </div>
          ) : null}
          {message ? (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">{message}</div>
          ) : null}

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Name</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                aria-label="Full name"
                value={nameNow}
                onChange={(e) => setPendingName(e.target.value === view.fullName ? null : e.target.value)}
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  if (value && value !== view.fullName && value !== pendingNameServer) void commitName(value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                dir="auto"
                className="h-11 w-full max-w-md rounded-lg border border-slate-300 px-3 text-base focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-gold-500/40"
              />
              {pendingNameServer || (pendingName && pendingName !== view.fullName) ? (
                <span className="text-xs font-medium text-amber-700">• edit pending</span>
              ) : null}
            </div>
            {pendingNameServer && pendingNameServer !== view.fullName ? (
              <p className="mt-1 text-xs text-slate-500">
                Saved as: {view.fullName}
              </p>
            ) : null}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Details</h2>
            <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              <Field label="Submitted" value={formatDateTime(view.submittedAt)} />
              <Field label="Type" value={view.submissionType === "GROUP" ? `Group · member ${view.groupPosition ?? "—"}` : "Individual"} />
              <Field label="Source" value={view.source === "ADMIN" ? "Added by admin" : "Public form"} />
              <Field label="Queue position" value={view.presentationOrder != null ? `#${view.presentationOrder}` : "—"} />
              <Field label="AI status" value={view.aiStatus} />
              <Field label="AI attempts" value={String(view.aiRetryCount)} />
            </dl>
            {view.aiError ? <p className="mt-2 text-xs text-red-700">Last AI error: {view.aiError}</p> : null}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Presentation order</h2>
            <p className="mt-1 text-xs text-slate-500">Position inside the queue (submission history is never changed).</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => changePosition((Number(queueOrder) || 1) - 2)} disabled={!view.presentationOrder}>
                Move earlier
              </Button>
              <Button variant="secondary" size="sm" onClick={() => changePosition(Number(queueOrder) || 1)} disabled={!view.presentationOrder}>
                Move later
              </Button>
              <label className="ml-1 flex items-center gap-1.5 text-xs text-slate-600">
                Position
                <input
                  type="number"
                  min={1}
                  value={queueOrder}
                  onChange={(e) => setQueueOrder(e.target.value === "" ? "" : Number(e.target.value))}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v >= 1 && v !== view.presentationOrder) void changePosition(v - 1);
                    else setQueueOrder(view.presentationOrder ?? "");
                  }}
                  className="h-9 w-16 rounded-md border border-slate-300 px-2 text-center text-sm tabular-nums focus:border-ink-900 focus:outline-none"
                  aria-label="Presentation queue position"
                />
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-red-200 bg-white p-5">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-red-600">Danger zone</h2>
            <p className="mt-1 text-xs text-slate-500">
              Deleting a participant removes their database record, image rows and stored photos (childhood, adult and generated) once
              you save. Other group members stay untouched.
            </p>
            <Button variant="danger" size="sm" className="mt-3" onClick={() => setConfirmDelete(true)} disabled={hasPendingDelete}>
              Delete participant
            </Button>
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void markDelete()}
        title="Delete participant?"
        message={
          <span>
            Are you sure you want to delete <strong>{view.fullName}</strong>? Photos are removed only after you save your changes.
          </span>
        }
        confirmLabel="Mark for deletion"
        danger
      />
      <ConfirmDialog
        open={confirmGroupDelete}
        onCancel={() => setConfirmGroupDelete(false)}
        onConfirm={() => void markGroupDelete()}
        title="Delete entire group?"
        message="Are you sure you want to delete this entire group? Every member, their database records and all stored photos will be removed after you save your changes."
        confirmLabel="Mark group for deletion"
        danger
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-medium text-ink-950">{value}</dd>
    </div>
  );
}

function ImageBlock({
  label,
  img,
  onChange,
  kind,
  pending,
}: {
  label: string;
  img: { id: string; url: string } | null;
  onChange: (v: { assetId: string; url: string }) => void;
  kind: "CHILDHOOD" | "ADULT" | "GRADUATION";
  pending: boolean;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-sm font-semibold text-ink-900">{label}</p>
        {pending ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
            Unsaved
          </span>
        ) : null}
      </div>
      <ImagePicker
        kind={kind}
        label={label}
        value={img ? { assetId: img.id, url: img.url } : null}
        onChange={onChange}
        ariaLabel={`Replace ${label}`}
        accent="light"
        allowCamera={false}
      />
    </div>
  );
}
