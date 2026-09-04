"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDraftContext } from "@/components/admin/DraftProvider";
import { Badge, Button, ConfirmDialog, InlineMessage, SectionTitle, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/web/api";
import type { ControlRoomSnapshot } from "@/lib/web/admin";

type Command = "start" | "pause" | "resume" | "next" | "previous" | "replay" | "skip" | "jump" | "restart";

export default function PresentationRoom() {
  const draft = useDraftContext();
  const [snap, setSnap] = useState<ControlRoomSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [busyCmd, setBusyCmd] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const [restartOpen, setRestartOpen] = useState(false);
  const [jumpOpen, setJumpOpen] = useState<string | null>(null);
  const dragIndex = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await api.get<ControlRoomSnapshot>("/api/admin/presentation");
      setSnap(s);
      setLocalOrder((cur) => cur ?? s.queue.map((q) => q.id));
    } catch {
      /* transient */
    }
  }, []);

  useEffect(() => {
    void load();
    const es = new EventSource("/api/realtime/stream");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.addEventListener("message", (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as { event?: string };
        if (data.event === "snapshot" || data.event === "update") void load();
      } catch {
        /* ignore */
      }
    });
    return () => es.close();
  }, [load]);

  const queue = snap?.queue ?? [];
  const displayOrder = useMemo(() => {
    if (!snap) return [];
    const ordered = localOrder ?? queue.map((q) => q.id);
    return ordered
      .map((id) => queue.find((q) => q.id === id))
      .filter((q): q is NonNullable<typeof q> => Boolean(q));
  }, [snap, localOrder, queue]);

  async function command(cmd: Command, participantId?: string) {
    setBusyCmd(cmd);
    setError(null);
    try {
      const res = await api.post<{ ok: boolean; snapshot: ControlRoomSnapshot; message?: string }>("/api/admin/presentation", {
        command: cmd,
        participantId,
      });
      setSnap(res.snapshot);
      setLocalOrder(res.snapshot.queue.map((q) => q.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update the presentation.");
    } finally {
      setBusyCmd(null);
    }
  }

  /** Record a queue reorder as an unsaved change. */
  async function persistOrder(next: string[]) {
    setLocalOrder(next);
    setError(null);
    try {
      await api.post("/api/admin/drafts", { field: "queue.presentationOrder", newValue: next });
      await draft.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the new queue order.");
    }
  }

  function move(id: string, kind: "up" | "down" | "top" | "bottom") {
    if (!localOrder) return;
    const list = [...localOrder];
    const i = list.indexOf(id);
    if (i < 0) return;
    list.splice(i, 1);
    let target = i;
    if (kind === "up") target = i - 1;
    else if (kind === "down") target = i + 1;
    else if (kind === "top") target = 0;
    else target = list.length;
    list.splice(Math.max(0, Math.min(list.length, target)), 0, id);
    void persistOrder(list);
  }

  const playback = snap?.state.playback ?? "IDLE";
  const current = snap?.current ?? null;
  const next = snap?.next ?? null;
  const showStart = playback === "IDLE" || !current;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <SectionTitle sub="Live control for the projector — changes appear instantly.">Presentation control room</SectionTitle>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
            <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-slate-300"}`} aria-hidden />
            {connected ? "Realtime connected" : "Realtime reconnecting…"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setRestartOpen(true)} disabled={queue.length === 0}>
            Restart queue
          </Button>
          <Link href="/admin/settings" className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-ink-900 hover:border-ink-900">
            Timing & link
          </Link>
        </div>
      </div>

      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}

      {/* Stage controls */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          {showStart ? (
            <Button onClick={() => command("start")} loading={busyCmd === "start"} disabled={queue.length === 0}>
              ▶ Start presentation
            </Button>
          ) : snap?.state.isPaused ? (
            <Button onClick={() => command("resume")} loading={busyCmd === "resume"}>
              ▶ Resume
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => command("pause")} loading={busyCmd === "pause"}>
              ⏸ Pause
            </Button>
          )}
          <Button variant="secondary" onClick={() => command("previous")} loading={busyCmd === "previous"} disabled={!current}>
            ⏮ Previous
          </Button>
          <Button variant="secondary" onClick={() => command("replay")} loading={busyCmd === "replay"} disabled={!current}>
            ↻ Replay
          </Button>
          <Button variant="secondary" onClick={() => command("skip")} loading={busyCmd === "skip"} disabled={!current}>
            Skip current
          </Button>
          <Button onClick={() => command("next")} loading={busyCmd === "next"} disabled={!current}>
            Next →
          </Button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Mode: <strong>{snap?.state.mode ?? "AUTOMATIC"}</strong>
          {snap?.state.autoPlay ? " · auto-advance on" : " · auto-advance off"}
          {snap?.state.loopAfterQueueEnd ? " · loops after the queue ends" : ""}
          {snap?.queueEnded ? " · queue ended" : ""}
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          {/* Current & next */}
          <div className="grid gap-4 sm:grid-cols-2">
            <StageCard
              title="CURRENT"
              fullName={current?.fullName ?? null}
              thumb={current?.graduationThumb ?? current?.childhoodThumb ?? null}
              sub={playback === "FINISHED" ? "The queue has finished." : snap?.queueEnded ? "All graduates have been presented." : playback === "IDLE" ? "Not started yet." : undefined}
              emptyText={showStart ? "Waiting to start…" : "…"}
            />
            <StageCard
              title="NEXT"
              fullName={next?.fullName ?? null}
              thumb={next?.graduationThumb ?? null}
              emptyText={snap?.queueEnded ? "No upcoming graduate." : "…"}
              footer={
                next ? (
                  <div className="flex gap-2">
                    <Link href={`/admin/participants/${next.id}`} className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-ink-900 hover:border-ink-900">
                      Edit next participant
                    </Link>
                    <button onClick={() => setJumpOpen(next.id)} className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:text-ink-900">
                      Present now →
                    </button>
                  </div>
                ) : null
              }
            />
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink-950">Presentation queue</h2>
              <div className="flex items-center gap-2">
                {draft.summary && draft.summary.changeCount > 0 ? (
                  <span className="text-xs font-medium text-amber-700">
                    New order is unsaved ({draft.summary.changeCount} {draft.summary.changeCount === 1 ? "change" : "changes"}) — use “Save Changes” below.
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">Drag rows or use the arrows to reorder.</span>
                )}
                {localOrder && JSON.stringify(localOrder) !== JSON.stringify(queue.map((q) => q.id)) ? (
                  <Button variant="ghost" size="sm" onClick={() => setLocalOrder(queue.map((q) => q.id))}>
                    Reset order
                  </Button>
                ) : null}
              </div>
            </div>

            {displayOrder.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">The queue is empty.</p>
            ) : (
              <ol className="mt-4 space-y-1.5">
                {displayOrder.map((entry, idx) => {
                  const isCurrent = entry.id === current?.id;
                  const presented = entry.presentationStatus === "PRESENTED";
                  return (
                    <li
                      key={entry.id}
                      draggable={!presented}
                      onDragStart={() => (dragIndex.current = idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        const from = dragIndex.current;
                        dragIndex.current = null;
                        if (from == null || from === idx || !localOrder) return;
                        const list = [...localOrder];
                        const [moved] = list.splice(from, 1);
                        list.splice(idx, 0, moved);
                        void persistOrder(list);
                      }}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                        isCurrent ? "border-gold-500/60 bg-cream-100" : presented ? "border-slate-100 bg-slate-50 opacity-60" : "border-slate-200 bg-white"
                      } ${presented ? "" : "cursor-grab active:cursor-grabbing"}`}
                    >
                      <span className="w-7 text-right text-sm tabular-nums text-slate-400">{idx + 1}</span>
                      <span className="flex h-9 w-9 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                        {entry.graduationThumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={entry.graduationThumb} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink-950">
                          {entry.fullName}
                          {isCurrent ? (
                            <Badge tone="gold" >
                              <span className="ml-1.5">Current</span>
                            </Badge>
                          ) : presented ? (
                            <Badge tone="green">
                              <span className="ml-1.5">Presented</span>
                            </Badge>
                          ) : null}
                        </span>
                      </span>
                      {!presented ? (
                        <>
                          <div className="hidden items-center gap-0.5 sm:flex">
                            <OrderBtn label="Move up" onClick={() => move(entry.id, "up")} disabled={idx === 0}>↑</OrderBtn>
                            <OrderBtn label="Move down" onClick={() => move(entry.id, "down")} disabled={idx === displayOrder.length - 1}>↓</OrderBtn>
                            <OrderBtn label="Move to top" onClick={() => move(entry.id, "top")} disabled={idx === 0}>⤒</OrderBtn>
                            <OrderBtn label="Move to bottom" onClick={() => move(entry.id, "bottom")} disabled={idx === displayOrder.length - 1}>⤓</OrderBtn>
                          </div>
                          {!isCurrent ? (
                            <button
                              onClick={() => setJumpOpen(entry.id)}
                              className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-cream-100 hover:text-ink-900"
                              title="Show this participant on the projector now"
                            >
                              Jump
                            </button>
                          ) : null}
                        </>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
            <p className="mt-3 text-xs text-slate-400">
              Drag & drop works for upcoming graduates; presented graduates stay in history.
            </p>
          </section>
        </div>

        {/* Right rail: info about mode/timing */}
        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Slide timing</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <TimingRow label="Childhood" ms={snap?.settings.childhoodDurationMs} />
              <TimingRow label="Smoke transition" ms={snap?.settings.smokeDurationMs} />
              <TimingRow label="Adult photo" ms={snap?.settings.adultDurationMs} />
              <TimingRow label="Name reveal" ms={snap?.settings.nameRevealDurationMs} />
              <TimingRow label="Transition" ms={snap?.settings.transitionDurationMs} />
            </dl>
            <Link href="/admin/settings" className="mt-4 inline-block text-xs font-semibold text-ink-900 underline underline-offset-4">
              Adjust timing in Settings →
            </Link>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 text-xs leading-relaxed text-slate-500">
            The projector opens its own screen and shows only the current graduate — the name, the childhood photo, the smoke reveal
            and the generated cap photo. Refreshing the projector keeps its place thanks to the server-side state.
          </section>
          {!connected ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
              Live updates are temporarily disconnected — controls still work, the projector will sync on its next refresh.
            </section>
          ) : null}
        </aside>
      </div>

      <ConfirmDialog
        open={restartOpen}
        onCancel={() => setRestartOpen(false)}
        onConfirm={() => {
          setRestartOpen(false);
          void command("restart");
        }}
        title="Restart the queue?"
        message="All graduates return to QUEUED and the presentation resets to idle. Their records are not changed."
        confirmLabel="Restart queue"
      />
      <ConfirmDialog
        open={Boolean(jumpOpen)}
        onCancel={() => setJumpOpen(null)}
        onConfirm={() => {
          const pid = jumpOpen;
          setJumpOpen(null);
          if (pid) void command("jump", pid);
        }}
        title="Present this graduate now?"
        message="The current graduate is marked as presented and this participant appears on the projector immediately."
        confirmLabel="Present now"
      />
    </div>
  );
}

function OrderBtn({ children, onClick, label, disabled }: { children: React.ReactNode; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-ink-900 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function TimingRow({ label, ms }: { label: string; ms?: number }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 last:border-0">
      <dt className="text-slate-600">{label}</dt>
      <dd className="font-medium tabular-nums text-ink-950">{ms != null ? `${(ms / 1000).toFixed(1)} s` : "—"}</dd>
    </div>
  );
}

function StageCard({
  title,
  fullName,
  thumb,
  sub,
  emptyText,
  footer,
}: {
  title: string;
  fullName: string | null;
  thumb: string | null;
  sub?: string;
  emptyText: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">{title}</p>
      {fullName ? (
        <div className="mt-3 flex items-center gap-4">
          <div className="h-16 w-16 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-300">
                <Spinner className="h-4 w-4 border-2" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-display truncate text-xl font-semibold text-ink-950">{fullName}</p>
            {sub ? <p className="mt-0.5 text-xs text-slate-500">{sub}</p> : null}
          </div>
        </div>
      ) : (
        <div className="mt-3 flex h-[76px] items-center">
          <p className="text-sm text-slate-400">{sub ?? emptyText}</p>
        </div>
      )}
      {footer ? <div className="mt-3">{footer}</div> : null}
    </div>
  );
}
