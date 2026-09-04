"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface CurrentPayload {
  status: "ok" | "waiting" | "finished";
  participantId?: string;
  name?: string;
  childhoodImageUrl?: string | null;
  adultImageUrl?: string | null;
  graduationImageUrl?: string | null;
  aiStatus?: string;
  playback?: "IDLE" | "RUNNING" | "PAUSED" | "FINISHED";
  isPaused?: boolean;
  mode?: "AUTOMATIC" | "MANUAL";
  loopAfterQueueEnd?: boolean;
  sequenceVersion?: number;
  durations?: {
    childhoodDurationMs: number;
    smokeDurationMs: number;
    adultDurationMs: number;
    nameRevealDurationMs: number;
    transitionDurationMs: number;
  };
  display?: Record<string, unknown>;
}

const DEFAULTS = {
  childhoodDurationMs: 2000,
  smokeDurationMs: 1200,
  adultDurationMs: 5000,
  nameRevealDurationMs: 800,
  transitionDurationMs: 800,
};

type Phase = "child" | "smoke" | "adult" | "name" | "done";

/**
 * Cinematic slide timeline (all durations configurable in admin settings):
 *   childhood photo → smoke fills the frame while the graduation photo
 *   cross-fades in → smoke clears → graduation photo holds → name reveals →
 *   slide ends (auto-advance in AUTOMATIC mode).
 *
 * The elapsed time of the current slide is tracked in a ref so Pause/Resume
 * continues from the exact same point, and refreshing the projector reloads
 * the authoritative server-side state (participant + timing + pause flag).
 */
export default function ProjectorScreen({ token }: { token: string }) {
  const [payload, setPayload] = useState<CurrentPayload | null>(null);
  const [error, setError] = useState(false);
  const [phase, setPhase] = useState<Phase>("child");
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const rafRef = useRef(0);
  const elapsedRef = useRef(0); // ms already consumed of the current slide
  const startedAtRef = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/presentation/current?token=${encodeURIComponent(token)}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error("invalid");
      const json = (await res.json()) as CurrentPayload;
      setError(false);
      setPayload(json);
    } catch {
      setError(true);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const es = new EventSource(`/api/realtime/stream?token=${encodeURIComponent(token)}`);
    es.addEventListener("message", (ev: MessageEvent) => {
      try {
        const d = JSON.parse(ev.data) as { event?: string };
        if (d.event === "update" || d.event === "snapshot") void load();
      } catch {
        /* malformed keep-alive */
      }
    });
    return () => es.close();
  }, [load, token]);

  const slideId =
    payload?.status === "ok" && payload.participantId ? `${payload.participantId}:${payload.sequenceVersion ?? 0}` : payload?.status ?? "none";
  const isRunning = payload?.status === "ok" && payload.playback === "RUNNING" && !payload.isPaused;

  function clearAll() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current.clear();
    cancelAnimationFrame(rafRef.current);
  }

  useEffect(() => {
    clearAll();
    elapsedRef.current = 0;
    setPhase("child");
    if (payload?.status !== "ok") return;
    // wait for running effect
  }, [slideId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    clearAll();
    if (payload?.status !== "ok") return;
    const d = { ...DEFAULTS, ...(payload.durations ?? {}) };
    const childhood = d.childhoodDurationMs;
    const smokeHalf = Math.round(d.smokeDurationMs / 2);
    const fadeStart = childhood + smokeHalf;
    const adultStart = childhood + d.smokeDurationMs;
    const total = childhood + d.smokeDurationMs + d.adultDurationMs;
    const nameAt = Math.max(adultStart, total - d.nameRevealDurationMs);

    const steps = [
      { at: fadeStart, phase: "smoke" as Phase },
      { at: adultStart, phase: "adult" as Phase },
      { at: nameAt, phase: "name" as Phase },
      { at: total, phase: "done" as Phase },
    ];

    if (!isRunning) {
      // paused — freeze at the current phase/elapsed
      return;
    }

    const startFrom = elapsedRef.current;
    startedAtRef.current = performance.now() - startFrom;

    // apply any phases whose time already passed (happens after resume)
    let currentPhase: Phase = "child";
    for (const s of steps) {
      if (startFrom >= s.at) currentPhase = s.phase;
    }
    if (currentPhase !== "child") {
      setPhase(currentPhase);
    }

    for (const s of steps) {
      const remaining = s.at - startFrom;
      if (remaining <= 0) continue;
      const t = setTimeout(() => setPhase(s.phase), remaining);
      timersRef.current.add(t);
    }

    // auto-advance when the full slide finishes
    const doneAt = Math.max(0, total - startFrom);
    const t = setTimeout(() => {
      if (!payload.isPaused && payload.playback === "RUNNING" && payload.mode === "AUTOMATIC") {
        fetch("/api/presentation/auto-advance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, version: payload.sequenceVersion ?? 0 }),
        }).catch(() => undefined);
      }
    }, doneAt);
    timersRef.current.add(t);

    const tick = () => {
      elapsedRef.current = performance.now() - startedAtRef.current;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      clearAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideId, isRunning, token]);

  useEffect(() => () => clearAll(), []);

  const durations = { ...DEFAULTS, ...(payload?.durations ?? {}) };
  const frameTone = String(payload?.display?.frameTone ?? "gold");

  if (error) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-ink-950 text-center text-white">
        <div>
          <p className="font-display text-3xl font-semibold tracking-tight">Graduation Presentation</p>
          <p className="mt-3 text-sm text-slate-400">Waiting for the presentation link…</p>
          <p className="mt-1 text-xs text-slate-600">If this keeps showing, ask the organizer to check the projector link.</p>
        </div>
      </div>
    );
  }

  const finished = payload?.status === "finished";
  const waiting = !payload || (payload.status !== "ok" && !finished) || !payload.name || !payload.childhoodImageUrl || !payload.graduationImageUrl;

  if (waiting) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-ink-950 px-8 text-center text-white">
        <div
          aria-hidden
          className="relative mb-8 h-24 w-24"
          style={{
            background:
              "radial-gradient(circle at 34% 30%, rgba(224,190,90,0.95), rgba(201,162,39,0) 68%), radial-gradient(circle at 52% 55%, rgba(201,162,39,0.4), rgba(0,0,0,0) 74%)",
          }}
        />
        <p className="font-display text-[clamp(2rem,6vmin,4.6rem)] font-semibold tracking-tight text-white">Graduation Presentation</p>
        <p className="mt-5 text-[clamp(1rem,2.6vmin,1.7rem)] text-slate-300">
          {finished ? "All graduates have been presented." : "Waiting for the first graduate..."}
        </p>
        {finished ? <p className="mt-2 text-sm text-slate-500">The ceremony continues — see the organizers for a re-run.</p> : null}
      </div>
    );
  }

  const p = payload as CurrentPayload & { name: string; childhoodImageUrl: string; graduationImageUrl: string };
  const childVisible = phase === "child" || phase === "smoke";
  const smokeOpacity = phase === "smoke" ? 0.92 : 0;
  const adultVisible = phase !== "child";
  const nameVisible = phase === "name" || phase === "done";

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-ink-950 px-6 py-8 text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[46%] h-[86vmin] w-[86vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold-500/[0.08] blur-[140px]" />
      </div>

      <div className="relative w-[min(76vmin,680px)]">
        <div
          className="absolute -inset-[1.6vmin] rounded-[3vmin] border-2 opacity-85"
          style={{
            borderColor:
              frameTone === "ink" ? "rgba(140,175,230,0.4)" : frameTone === "cream" ? "rgba(255,255,255,0.45)" : "rgba(201,162,39,0.85)",
          }}
        />
        <div className="relative aspect-square w-full overflow-hidden rounded-[2.4vmin] bg-ink-900">
          <img
            src={p.childhoodImageUrl}
            alt=""
            aria-hidden={!childVisible}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${childVisible ? "opacity-100" : "opacity-0"}`}
          />
          <img
            src={p.graduationImageUrl}
            alt={`${p.name} graduation photo`}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${adultVisible ? "opacity-100" : "opacity-0"}`}
          />
          <SmokeLayer opacity={smokeOpacity} durationMs={Math.max(200, Math.round(durations.smokeDurationMs / 2))} />
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-4 right-4 rounded-full border px-3 py-1 text-[1.6vmin] font-medium backdrop-blur-sm"
            style={{ borderColor: "rgba(255,255,255,0.35)", color: "rgba(255,255,255,0.9)", background: "rgba(4,10,18,0.25)" }}
          >
            ✦ {new Date().getFullYear()}
          </div>
        </div>
      </div>

      <div
        className="mt-[3.2vmin] flex flex-col items-center text-center transition-all ease-out"
        style={{
          opacity: nameVisible ? 1 : 0,
          transform: nameVisible ? "translateY(0)" : "translateY(2vmin)",
          transitionDuration: `${durations.nameRevealDurationMs}ms`,
        }}
      >
        <div aria-hidden className="h-px w-28 bg-gradient-to-r from-transparent via-gold-400/90 to-transparent" />
        <h1 className="font-display mt-[1.8vmin] max-w-[86vw] text-[clamp(1.8rem,5.4vmin,4.2rem)] font-semibold leading-tight tracking-wide text-white">
          {p.name}
        </h1>
        <p
          className="mt-[1vmin] text-[clamp(0.55rem,1.9vmin,0.9rem)] font-medium uppercase tracking-[0.5em]"
          style={{ color: frameTone === "ink" ? "#a9c1e8" : frameTone === "cream" ? "#e9e0cc" : "#d4af4f" }}
        >
          ✦ Graduate ✦
        </p>
      </div>
    </main>
  );
}

function SmokeLayer({ opacity, durationMs }: { opacity: number; durationMs: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 transition-opacity ease-in-out"
      style={{
        opacity,
        transitionDuration: `${durationMs}ms`,
        background:
          "radial-gradient(ellipse 60% 55% at 26% 24%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.55) 24%, rgba(255,255,255,0.2) 44%, rgba(235,240,248,0) 64%)," +
          "radial-gradient(ellipse 55% 58% at 76% 28%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.45) 30%, rgba(255,255,255,0.14) 50%, rgba(235,240,248,0) 70%)," +
          "radial-gradient(ellipse 70% 46% at 52% 80%, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.32) 36%, rgba(255,255,255,0.1) 58%, rgba(0,0,0,0) 74%)",
        filter: "blur(2px)",
      }}
    />
  );
}
