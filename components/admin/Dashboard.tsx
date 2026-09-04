"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { StatCard } from "@/components/admin/StatCard";
import { InlineMessage, SectionTitle } from "@/components/ui";
import { api } from "@/lib/web/api";
import type { AdminStats } from "@/lib/web/admin";

export default function Dashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [notice, setNotice] = useState<{ count: number } | null>(null);

  const load = useCallback(async () => {
    const [s, n] = await Promise.all([
      api.get<AdminStats>("/api/admin/stats").catch(() => null),
      api.get<{ notice: { count: number } | null }>("/api/admin/notice").catch(() => null),
    ]);
    setStats(s);
    setNotice(n?.notice ?? null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <SectionTitle sub="Everything about your graduates at a glance.">Dashboard</SectionTitle>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/participants?add=1" className="inline-flex h-10 items-center rounded-lg bg-ink-900 px-4 text-sm font-medium text-white hover:bg-ink-800">
            + Add participant
          </Link>
          <Link
            href="/admin/presentation"
            className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-ink-900 hover:border-ink-900"
          >
            Open control room
          </Link>
        </div>
      </div>

      {notice ? (
        <InlineMessage tone="info">
          You had <strong>{notice.count}</strong> unsaved {notice.count === 1 ? "change" : "changes"} in your previous session. They
          were not saved.
        </InlineMessage>
      ) : null}

      {!stats ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-[86px] rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <section aria-label="Submissions">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Submissions</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Total participants" value={stats.totalParticipants} />
              <StatCard label="Total groups" value={stats.totalGroups} />
              <StatCard label="Individual entries" value={stats.individuals} />
              <StatCard label="Group entries" value={stats.groups} />
            </div>
          </section>

          <section aria-label="AI generation">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Graduation photo AI</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Completed" value={stats.completedAi} tone="ok" />
              <StatCard label="Pending" value={stats.pendingAi} tone="warn" />
              <StatCard label="Processing" value={stats.processingAi} />
              <StatCard label="Failed · retry available" value={stats.failedAi} tone="danger" />
            </div>
          </section>

          <section aria-label="Presentation">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Presentation</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Queued" value={stats.queued} />
              <StatCard label="Current" value={stats.current} tone="gold" />
              <StatCard label="Presented" value={stats.presented} tone="ok" />
              <StatCard label="Skipped" value={stats.skipped} tone="warn" />
            </div>
          </section>

          {(stats.failedAi > 0 || stats.pendingAi > 0) && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm text-amber-900">
                {stats.pendingAi + stats.failedAi} graduation photos still need AI generation.
              </p>
              <Link href="/admin/participants?filter=pending" className="text-sm font-semibold text-amber-900 underline underline-offset-4">
                Review participants
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
