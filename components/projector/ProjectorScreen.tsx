"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "./ProjectorScreen.css";

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
  smokeDurationMs: 1800,
  adultDurationMs: 5200,
  nameRevealDurationMs: 900,
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

  const d = { ...DEFAULTS, ...(payload?.durations ?? {}) };
  const sequenceVersion = payload?.sequenceVersion ?? 0;
  const mode = payload?.mode;
  const isPaused = payload?.isPaused;
  const playback = payload?.playback;

  useEffect(() => {
    clearTimers();
    if (!running || payload?.status !== "ok") return;

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
    events.forEach(([at, next]) => timersRef.current.add(setTimeout(() => setPhase(next), at)));

    timersRef.current.add(setTimeout(() => {
      if (mode === "AUTOMATIC" && !isPaused && playback === "RUNNING") {
        void fetch("/api/presentation/auto-advance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, version: sequenceVersion }),
        }).catch(() => undefined);
      }
    }, total));

    return clearTimers;
  }, [slideId, running, token, sequenceVersion, mode, isPaused, playback, d.childhoodDurationMs, d.smokeDurationMs, d.adultDurationMs, d.nameRevealDurationMs, clearTimers]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  if (error) return <main className="projector-stage"><div className="projector-status">تعذر الاتصال بشاشة العرض</div></main>;
  if (!payload || payload.status === "waiting") return <main className="projector-stage"><div className="projector-status">في انتظار الخريج التالي…</div></main>;
  if (payload.status === "finished") return <main className="projector-stage"><div className="projector-status">انتهى عرض جميع الخريجين</div></main>;

  const graduationUrl = payload.graduationImageUrl ?? payload.adultImageUrl ?? null;
  if (!payload.name || !payload.childhoodImageUrl || !graduationUrl) {
    return <main className="projector-stage"><div className="projector-status">بيانات الخريج غير مكتملة</div></main>;
  }

  const childVisible = phase === "child" || phase === "smoke";
  const adultVisible = phase === "smoke" || phase === "adult" || phase === "name" || phase === "done";
  const smokeVisible = phase === "smoke";
  const nameFull = phase === "adult" || phase === "name" || phase === "done";

  return (
    <main className={`projector-stage projector-phase-${phase}`} aria-label="شاشة عرض حفل التخرج">
      <div className="projector-halo" aria-hidden="true" />
      <div className="projector-vignette" aria-hidden="true" />
      <div className="projector-frame">
        <div className="projector-frame-inner">
          <div className={`projector-photo projector-photo-child ${childVisible ? "is-visible" : ""}`}>
            <img src={payload.childhoodImageUrl} alt="" />
          </div>
          <div className={`projector-photo projector-photo-adult ${adultVisible ? "is-visible" : ""}`}>
            <img src={graduationUrl} alt="" />
          </div>
          <div className={`projector-smoke ${smokeVisible ? "is-visible" : ""}`} aria-hidden="true">
            <div className="smoke-depth smoke-depth-back" />
            <div className="smoke-depth smoke-depth-mid" />
            <div className="smoke-depth smoke-depth-front" />
            <div className="smoke-core" />
            <div className="cloud cloud-0" />
            <div className="cloud cloud-1" />
            <div className="cloud cloud-2" />
            <div className="cloud cloud-3" />
            <div className="cloud cloud-4" />
            <div className="cloud cloud-5" />
            <div className="cloud cloud-6" />
            <div className="cloud cloud-7" />
          </div>
          <div className="projector-light-sweep" aria-hidden="true" />
        </div>
      </div>
      <div className={`projector-name-plate is-visible ${nameFull ? "is-full" : "is-small"}`}>
        <span className="projector-name-kicker">حفلة التخرج</span>
        <span className="projector-name">{payload.name}</span>
      </div>
    </main>
  );
}
