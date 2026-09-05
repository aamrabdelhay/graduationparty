"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface CurrentPayload {
  status: "ok" | "waiting" | "finished";
  participantId?: string;
  name?: string;
  childhoodImageUrl?: string | null;
  adultImageUrl?: string | null;
  graduationImageUrl?: string | null;
  playback?: "IDLE" | "RUNNING" | "PAUSED" | "FINISHED";
  isPaused?: boolean;
  mode?: "AUTOMATIC" | "MANUAL";
  sequenceVersion?: number;
  durations?: {
    childhoodDurationMs: number;
    smokeDurationMs: number;
    adultDurationMs: number;
    nameRevealDurationMs: number;
    transitionDurationMs: number;
  };
}

const DEFAULTS = {
  childhoodDurationMs: 2200,
  smokeDurationMs: 1700,
  adultDurationMs: 5200,
  nameRevealDurationMs: 850,
  transitionDurationMs: 1100,
};

type Phase = "child" | "smoke" | "adult" | "name" | "done";

export default function ProjectorScreen({ token }: { token: string }) {
  const [payload, setPayload] = useState<CurrentPayload | null>(null);
  const [error, setError] = useState(false);
  const [phase, setPhase] = useState<Phase>("child");
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const slideRef = useRef("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/presentation/current?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      setPayload((await res.json()) as CurrentPayload);
      setError(false);
    } catch {
      setError(true);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const poll = window.setInterval(() => void load(), 900);
    return () => window.clearInterval(poll);
  }, [load]);

  const slideId = payload?.status === "ok" && payload.participantId
    ? `${payload.participantId}:${payload.sequenceVersion ?? 0}`
    : payload?.status ?? "none";
  const running = payload?.status === "ok" && payload.playback === "RUNNING" && !payload.isPaused;

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current.clear();
  }, []);

  useEffect(() => {
    if (slideRef.current === slideId) return;
    slideRef.current = slideId;
    clearTimers();
    setPhase("child");
  }, [slideId, clearTimers]);

  useEffect(() => {
    clearTimers();
    if (!running || payload?.status !== "ok") return;

    const d = { ...DEFAULTS, ...(payload.durations ?? {}) };
    const smokeAt = d.childhoodDurationMs;
    const adultAt = smokeAt + d.smokeDurationMs;
    const nameAt = adultAt + Math.max(0, d.adultDurationMs - d.nameRevealDurationMs);
    const total = adultAt + d.adultDurationMs;

    const events: Array<[number, Phase]> = [
      [smokeAt, "smoke"],
      [adultAt, "adult"],
      [nameAt, "name"],
      [total, "done"],
    ];
    events.forEach(([at, next]) => {
      const timer = setTimeout(() => setPhase(next), at);
      timersRef.current.add(timer);
    });

    const advance = setTimeout(() => {
      if (payload.playback === "RUNNING" && payload.mode === "AUTOMATIC" && !payload.isPaused) {
        void fetch("/api/presentation/auto-advance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, version: payload.sequenceVersion ?? 0 }),
        });
      }
    }, total);
    timersRef.current.add(advance);

    return clearTimers;
  }, [slideId, running, token, payload, clearTimers]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  if (error) return <main className="projector-stage"><div className="projector-status">تعذر الاتصال بشاشة العرض</div></main>;
  if (!payload || payload.status === "waiting") return <main className="projector-stage"><div className="projector-status">في انتظار الخريج التالي…</div></main>;
  if (payload.status === "finished") return <main className="projector-stage"><div className="projector-status">انتهى عرض جميع الخريجين</div></main>;

  const graduationUrl = payload.graduationImageUrl ?? payload.adultImageUrl ?? null;
  if (!payload.name || !payload.childhoodImageUrl || !graduationUrl) {
    return <main className="projector-stage"><div className="projector-status">بيانات الخريج غير مكتملة</div></main>;
  }

  const d = { ...DEFAULTS, ...(payload.durations ?? {}) };
  const childVisible = phase === "child" || phase === "smoke";
  const adultVisible = phase === "smoke" || phase === "adult" || phase === "name" || phase === "done";
  const smokeVisible = phase === "smoke";
  const nameVisible = phase !== "done";
  const nameFull = phase === "adult" || phase === "name" || phase === "done";

  return (
    <main className={`projector-stage projector-phase-${phase}`} aria-label="شاشة عرض حفل التخرج">
      <div className="projector-halo" aria-hidden />
      <div className="projector-vignette" aria-hidden />
      <div className="projector-frame">
        <div className="projector-frame-inner">
          <div className={`projector-photo projector-photo-child ${childVisible ? "is-visible" : ""}`}>
            <img src={payload.childhoodImageUrl} alt="" />
          </div>
          <div className={`projector-photo projector-photo-adult ${adultVisible ? "is-visible" : ""}`}>
            <img src={graduationUrl} alt="" />
          </div>
          <div className={`projector-smoke ${smokeVisible ? "is-visible" : ""}`} aria-hidden>
            <span className="smoke-layer smoke-layer-a" />
            <span className="smoke-layer smoke-layer-b" />
            <span className="smoke-layer smoke-layer-c" />
            <span className="smoke-core" />
          </div>
          <div className="projector-light-sweep" aria-hidden />
        </div>
      </div>
      <div
        className={`projector-name-plate ${nameVisible ? "is-visible" : ""} ${nameFull ? "is-full" : "is-small"}`}
        style={{ transitionDuration: `${Math.max(500, d.nameRevealDurationMs)}ms` }}
      >
        <span className="projector-name-kicker">حفلة التخرج</span>
        <span className="projector-name">{payload.name}</span>
      </div>
    </main>
  );
}
