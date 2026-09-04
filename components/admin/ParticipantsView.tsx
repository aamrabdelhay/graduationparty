"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import ImagePicker from "@/components/ImagePicker";
import { Badge, Button, Input, Modal, SectionTitle, aiStatusBadge, presentationStatusBadge, EmptyState } from "@/components/ui";
import { api, ApiError } from "@/lib/web/api";
import { deleteStagedAsset } from "@/lib/web/submission";
import { groupLabel, formatTimeHMSSec, formatDateTime } from "@/lib/format";
import type { ParticipantListItem } from "@/lib/web/admin";
import { useDraftContext } from "@/components/admin/DraftProvider";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "individuals", label: "Individuals" },
  { id: "groups", label: "Groups" },
  { id: "pending", label: "Pending" },
  { id: "completed", label: "Completed" },
  { id: "failed", label: "Failed" },
  { id: "queued", label: "Queued" },
  { id: "presented", label: "Presented" },
  { id: "skipped", label: "Skipped" },
] as const;

export default function ParticipantsView() {
  const router = useRouter();
  const params = useSearchParams();
  const [filter, setFilter] = useState<string>(params.get("filter") ?? "all");
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [items, setItems] = useState<ParticipantListItem[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (params.get("add") === "1") setAddOpen(true);
  }, [params]);

  const load = useCallback(async (query: string, flt: string) => {
    try {
      const res = await api.get<{ items: ParticipantListItem[] }>(
        `/api/admin/participants?search=${encodeURIComponent(query)}&filter=${flt}`,
      );
      setItems(res.items);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load(search, filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void load(search, filter), 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function changeFilter(f: string) {
    setFilter(f);
    router.replace(`/admin/participants?filter=${f}`, { scroll: false });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionTitle sub="Search, filter and open any graduate.">Participants</SectionTitle>
        <Button onClick={() => setAddOpen(true)}>+ Add participant</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full max-w-xs">
          <Input
            aria-label="Search participants"
            placeholder="Search by full name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            id="participant-search"
          />
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter participants">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => changeFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f.id ? "border-ink-900 bg-ink-900 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-ink-900"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {items === null ? (
        <div className="skeleton h-[420px] rounded-xl" />
      ) : items.length === 0 ? (
        <EmptyState>
          <p className="text-sm">No participants match this view.</p>
          <button onClick={() => { setSearch(""); setFilter("all"); }} className="mt-3 text-sm font-semibold text-ink-900 underline underline-offset-4">
            Clear search & filters
          </button>
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 font-semibold">#</th>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Group</th>
                <th className="px-4 py-3 font-semibold">Submission time</th>
                <th className="px-4 py-3 font-semibold">AI status</th>
                <th className="px-4 py-3 font-semibold">Presentation</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p, idx) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-cream-50/70">
                  <td className="px-4 py-3 tabular-nums text-slate-400">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/participants/${p.id}`} className="group flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                        {p.graduationThumb ?? p.adultThumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.graduationThumb ?? p.adultThumb!} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </span>
                      <span className="font-medium text-ink-950 group-hover:underline group-hover:decoration-gold-500 group-hover:underline-offset-2">
                        {p.fullName}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={p.submissionType === "GROUP" ? "gold" : "neutral"}>{p.submissionType === "GROUP" ? "Group" : "Individual"}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.groupNumber != null ? groupLabel(p.groupNumber) : "—"}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-600" title={formatDateTime(p.submittedAt)}>
                    {formatTimeHMSSec(p.submittedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={aiStatusBadge(p.aiStatus).tone}>{aiStatusBadge(p.aiStatus).label}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={presentationStatusBadge(p.presentationStatus).tone}>
                      {presentationStatusBadge(p.presentationStatus).label}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/participants/${p.id}`} className="text-sm font-semibold text-ink-900 underline decoration-slate-300 underline-offset-4 hover:decoration-gold-500">
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {addOpen ? <AddParticipantModal onClose={() => setAddOpen(false)} onAdded={(id) => router.push(`/admin/participants/${id}`)} /> : null}
    </div>
  );
}

function AddParticipantModal({ onClose, onAdded }: { onClose: () => void; onAdded: (id: string) => void }) {
  const { refresh } = useDraftContext();
  const [fullName, setFullName] = useState("");
  const [childhood, setChildhood] = useState<{ assetId: string; url: string } | null>(null);
  const [adult, setAdult] = useState<{ assetId: string; url: string } | null>(null);
  const [graduation, setGraduation] = useState<{ assetId: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = fullName.trim().length >= 2 && childhood && adult;

  async function save() {
    if (!canSave || !childhood || !adult) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ participantIds: string[] }>("/api/admin/participants", {
        participants: [
          {
            fullName,
            childhoodImageId: childhood.assetId,
            adultImageId: adult.assetId,
            graduationImageId: graduation?.assetId ?? null,
          },
        ],
      });
      await refresh();
      onAdded(res.participantIds[0]!);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add the participant.");
      setBusy(false);
    }
  }

  async function cancel() {
    await Promise.all([
      deleteStagedAsset(childhood?.assetId),
      deleteStagedAsset(adult?.assetId),
      deleteStagedAsset(graduation?.assetId),
    ]);
    onClose();
  }

  return (
    <Modal open onClose={() => void cancel()} title="Add participant manually" wide>
      <div className="space-y-6">
        <Input
          label="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="First Middle Last"
          autoComplete="off"
        />
        <div className="grid gap-5 sm:grid-cols-3">
          <ImagePicker
            kind="CHILDHOOD"
            label="Childhood photo"
            value={childhood}
            onChange={(img) => setChildhood({ assetId: img.assetId, url: img.url })}
            onRemove={childhood ? () => { void deleteStagedAsset(childhood.assetId); setChildhood(null); } : undefined}
            ariaLabel="Upload childhood photo (admin)"
            accent="light"
          />
          <ImagePicker
            kind="ADULT"
            label="Adult photo"
            value={adult}
            onChange={(img) => setAdult({ assetId: img.assetId, url: img.url })}
            onRemove={adult ? () => { void deleteStagedAsset(adult.assetId); setAdult(null); } : undefined}
            ariaLabel="Upload adult photo (admin)"
            accent="light"
          />
          <ImagePicker
            kind="GRADUATION"
            label="Graduation photo (optional)"
            value={graduation}
            onChange={(img) => setGraduation({ assetId: img.assetId, url: img.url })}
            onRemove={graduation ? () => { void deleteStagedAsset(graduation.assetId); setGraduation(null); } : undefined}
            ariaLabel="Upload graduation photo (admin)"
            accent="light"
          />
        </div>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <p className="text-xs leading-relaxed text-slate-500">
          The participant is added directly (marked as admin-created) and queued after existing graduates. If you skip the graduation
          photo, it can be generated afterwards.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => void cancel()}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!canSave} loading={busy}>
            Add participant
          </Button>
        </div>
      </div>
    </Modal>
  );
}
