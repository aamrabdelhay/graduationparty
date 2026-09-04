"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useDraftContext } from "@/components/admin/DraftProvider";
import { Badge, Button, ConfirmDialog, EmptyState, SectionTitle, aiStatusBadge } from "@/components/ui";
import { api } from "@/lib/web/api";
import { groupLabel, formatDateTime } from "@/lib/format";

interface GroupMember {
  id: string;
  fullName: string;
  groupPosition: number | null;
  aiStatus: string;
  presentationStatus: string;
  childhoodThumb: string | null;
  adultThumb: string | null;
  graduationThumb: string | null;
}
interface GroupView {
  id: string;
  number: number;
  createdAt: string;
  submissionId: string;
  submittedAt: string;
  members: GroupMember[];
}

export default function GroupsView() {
  const draft = useDraftContext();
  const [groups, setGroups] = useState<GroupView[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<GroupView | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ groups: GroupView[] }>("/api/admin/groups");
      setGroups(res.groups);
    } catch {
      setGroups([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markDelete = async (g: GroupView) => {
    setBusy(true);
    try {
      await api.post("/api/admin/drafts", { field: "group.delete", newValue: g.id });
      await draft.refresh();
      setConfirmDelete(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionTitle sub="Each group shares one submission; every member stays an independent record.">Groups</SectionTitle>
      {groups === null ? (
        <div className="skeleton h-80 rounded-xl" />
      ) : groups.length === 0 ? (
        <EmptyState>No group submissions yet.</EmptyState>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <header className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-3.5">
                <h2 className="font-display text-lg font-semibold text-ink-950">{groupLabel(g.number)}</h2>
                <Badge tone="gold">{g.members.length} members</Badge>
                <span className="text-xs tabular-nums text-slate-500">Submitted {formatDateTime(g.submittedAt)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-red-700 hover:bg-red-50"
                  onClick={() => setConfirmDelete(g)}
                >
                  Delete entire group
                </Button>
              </header>
              <ol className="divide-y divide-slate-100">
                {g.members.map((m) => (
                  <li key={m.id}>
                    <Link href={`/admin/participants/${m.id}`} className="group flex items-center gap-4 px-5 py-3 hover:bg-cream-50/60">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
                        {m.groupPosition ?? "—"}
                      </span>
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                        {m.graduationThumb ?? m.adultThumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.graduationThumb ?? m.adultThumb!} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </span>
                      <span className="flex-1 font-medium text-ink-950 group-hover:underline group-hover:decoration-gold-500 group-hover:underline-offset-2">
                        {m.fullName}
                      </span>
                      <Badge tone={aiStatusBadge(m.aiStatus).tone}>{aiStatusBadge(m.aiStatus).label}</Badge>
                      <Badge tone="neutral">{m.presentationStatus.toLowerCase()}</Badge>
                      <span className="text-xs font-semibold text-slate-400 group-hover:text-ink-900">Open →</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && void markDelete(confirmDelete)}
        title="Delete entire group?"
        message={
          confirmDelete ? (
            <span>
              Are you sure you want to delete <strong>{groupLabel(confirmDelete.number)}</strong>? All{" "}
              <strong>{confirmDelete.members.length} members</strong>, their records and stored photos will be removed after you
              save your changes.
            </span>
          ) : null
        }
        confirmLabel="Mark group for deletion"
        danger
        loading={busy}
      />
    </div>
  );
}
