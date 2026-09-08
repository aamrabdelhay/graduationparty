"use client";

import { useEffect, useRef, useState } from "react";
import { GraduationCap, Maximize, Sparkles } from "lucide-react";
import SmokeCanvas from "./SmokeCanvas";

interface Snap {
  status: "IDLE" | "RUNNING" | "FINISHED";
  isPaused: boolean;
  playbackMode: string;
  queuePosition: number;
  sequenceVersion: number;
  phaseStartedAt: string | null;
  childhoodDuration: number;
  smokeDuration: number;
  adultDuration: number;
  nameAnimationDuration: number;
  participant: {
    id: string;
    name: string;
    childhoodImageUrl: string | null;
    graduationImageUrl: string | null;
  } | null;
}

type Phase = "childhood" | "smoke" | "adult" | "name" | "done";

export default function Projector({ token }: { token: string }) {
  const [snap, setSnap] = useState<Snap | null>(null);
  const [phase, setPhase] = useState<Phase>("childhood");
  const [showAdult, setShowAdult] = useState(false);
  const [live, setLive] = useState(false);
  const wasPaused = useRef(false);

  /* ------------------------------ Real-time feed ------------------------------ */
  useEffect(() => {
    const es = new EventSource(`/api/presentation/stream?token=${token}`);
    es.onopen = () => setLive(true);
    es.onmessage = (e) => {
      try {
        setSnap(JSON.parse(e.data));
        setLive(true);
      } catch {
        /* noop */
      }
    };
    es.onerror = () => setLive(false); // EventSource auto-reconnects
    return () => es.close();
  }, [token]);

  /* Polling fallback keeps the projector recoverable after refresh/restarts */
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const r = await fetch(`/api/presentation/current?token=${token}`);
        const j = await r.json();
        if (j.ok) setSnap(j.state);
      } catch {
        /* noop */
      }
    }, 7000);
    return () => clearInterval(poll);
  }, [token]);

  /* ------------------------------- Show timeline ------------------------------- */
  const seq = snap?.sequenceVersion;
  const status = snap?.status;
  const pid = snap?.participant?.id;

  useEffect(() => {
    if (!snap || status !== "RUNNING" || !snap.participant || snap.isPaused) return;
    setShowAdult(false);
    setPhase("childhood");
    const t = setTimeout(() => setPhase("smoke"), snap.childhoodDuration);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq, pid, status]);

  useEffect(() => {
    if (!snap) return;
    if (phase === "adult") {
      const t = setTimeout(() => setPhase("name"), snap.adultDuration);
      return () => clearTimeout(t);
    }
    if (phase === "name") {
      const t = setTimeout(() => setPhase("done"), snap.nameAnimationDuration);
      return () => clearTimeout(t);
    }
  }, [phase, snap]);

  /* Pause: freeze the stage lights exactly where they are (no spoilers) */
  useEffect(() => {
    const paused = !!snap?.isPaused;
    if (paused && !wasPaused.current) {
      setPhase((ph) => {
        if (showAdult) return "done";
        return ph === "smoke" ? "childhood" : ph;
      });
    }
    wasPaused.current = paused;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap?.isPaused]);

  const idle = !snap || snap.status === "IDLE";
  const finished = snap?.status === "FINISHED";

  return (
    <main className="relative flex h-dvh select-none flex-col items-center justify-center overflow-hidden bg-night-950">
      {/* Ambient stage lighting */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-20%] right-1/2 h-[70vh] w-[110vw] translate-x-1/2 rounded-[100%] bg-[radial-gradient(ellipse_at_center,rgba(212,175,55,0.14),transparent_60%)] blur-2xl" />
        <div className="absolute bottom-[-30%] right-1/2 h-[50vh] w-[80vw] translate-x-1/2 rounded-[100%] bg-[radial-gradient(ellipse_at_center,rgba(90,60,160,0.12),transparent_65%)] blur-3xl" />
      </div>

      {/* Tiny live indicator + fullscreen */}
      <div className="absolute top-4 left-4 z-40 flex items-center gap-3 opacity-30 transition-opacity hover:opacity-100">
        <span
          className={`size-2 rounded-full ${live ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`}
          title={live ? "متصل" : "إعادة اتصال"}
        />
        <button
          onClick={() => {
            if (document.fullscreenElement) document.exitFullscreen();
            else document.documentElement.requestFullscreen().catch(() => undefined);
          }}
          className="text-ivory/70 hover:text-gold-300"
          aria-label="ملء الشاشة"
        >
          <Maximize className="size-4" />
        </button>
      </div>

      {/* ------------------------------- IDLE ------------------------------- */}
      {idle && (
        <div className="relative z-10 flex flex-col items-center text-center animate-fade-in px-6">
          <span className="mb-8 rounded-full border border-gold-500/35 bg-gold-500/8 p-8">
            <GraduationCap className="size-16 animate-float-slow text-gold-400" />
          </span>
          <h1 className="font-display text-4xl font-bold sm:text-6xl">
            <span className="gold-text animate-shimmer">حفل التخرج</span>
          </h1>
          <p className="mt-4 flex items-center gap-2 text-sm text-ivory/50">
            <Sparkles className="size-4 text-gold-400/70" />
            بانتظار بدء عرض الخريجين من غرفة التحكم
            <Sparkles className="size-4 text-gold-400/70" />
          </p>
        </div>
      )}

      {/* ------------------------------ FINISHED ------------------------------ */}
      {finished && (
        <div className="relative z-10 flex flex-col items-center text-center animate-fade-in px-6">
          <GraduationCap className="mb-8 size-20 text-gold-400" />
          <h1 className="font-display text-5xl font-bold sm:text-7xl">
            <span className="gold-text animate-shimmer">مبروك التخرج</span>
          </h1>
          <p className="mt-5 font-display text-2xl text-ivory/70">
            لكل بطل شاركنا لحظته النهاردة
          </p>
        </div>
      )}

      {/* ------------------------------ THE SHOW ------------------------------ */}
      {!idle && !finished && snap?.participant && (
        <div key={snap.sequenceVersion} className="relative z-10 flex h-full flex-col items-center justify-center gap-5 px-4">
          {/* Ornamental graduation frame */}
          <div className="relative animate-fade-up">
            {/* Emblem on top */}
            <div className="absolute -top-9 right-1/2 z-30 translate-x-1/2">
              <span className="flex size-18 items-center justify-center rounded-full border-2 border-gold-500/70 bg-night-900 shadow-[0_0_40px_-6px_rgba(212,175,55,0.55)]">
                <GraduationCap className="size-9 text-gold-400" />
              </span>
            </div>

            <div className="lux-frame lux-corner relative overflow-hidden rounded-[28px] p-2.5">
              <div className="relative h-[58dvh] w-[min(82vw,46dvh)] overflow-hidden rounded-2xl bg-night-900">
                {/* Childhood photo */}
                {snap.participant.childhoodImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={snap.participant.childhoodImageUrl}
                    alt=""
                    className={`photo-old absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
                      showAdult ? "opacity-0" : "opacity-100"
                    }`}
                  />
                )}
                {/* Graduation photo */}
                {snap.participant.graduationImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={snap.participant.graduationImageUrl}
                    alt=""
                    className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
                      showAdult ? "opacity-100" : "opacity-0"
                    }`}
                  />
                )}
                {/* Vignette */}
                <div className="pointer-events-none absolute inset-0 z-10 shadow-[inset_0_0_80px_20px_rgba(0,0,0,0.55)]" />
                {/* Smoke transition */}
                {phase === "smoke" && !snap.isPaused && (
                  <SmokeCanvas
                    key={`smoke-${snap.sequenceVersion}`}
                    durationMs={snap.smokeDuration}
                    onMidpoint={() => setShowAdult(true)}
                    onDone={() => setPhase("adult")}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Name plate */}
          <div className="h-26">
            {(phase === "name" || phase === "done") && (
              <div
                key={`name-${snap.sequenceVersion}`}
                className="animate-name-reveal relative"
              >
                <div className="lux-frame rounded-2xl px-10 py-4 sm:px-14">
                  <p className="text-center font-display text-3xl leading-snug font-bold sm:text-5xl">
                    <span className="gold-text">{snap.participant.name}</span>
                  </p>
                </div>
                <span className="absolute top-1/2 -right-7 size-3 -translate-y-1/2 rotate-45 border border-gold-500/70 bg-night-900" />
                <span className="absolute top-1/2 -left-7 size-3 -translate-y-1/2 rotate-45 border border-gold-500/70 bg-night-900" />
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
