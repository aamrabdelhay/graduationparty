"use client";

import { useEffect, useRef, useState } from "react";
import { GraduationCap, Maximize, Sparkles } from "lucide-react";
import SmokeCanvas from "./SmokeCanvas";

interface PersonPreview {
  id: string;
  name: string;
  childhoodImageUrl: string | null;
  graduationImageUrl: string | null;
}

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
  participant: PersonPreview | null;
  nextParticipant: PersonPreview | null;
}

type Phase = "childhood" | "smoke" | "adult" | "name" | "done";

async function sendPresentationAction(action: string) {
  try {
    const response = await fetch("/api/admin/presentation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!response.ok) return;
    return response.json();
  } catch {
    return undefined;
  }
}

export default function Projector({ token }: { token: string }) {
  const [snap, setSnap] = useState<Snap | null>(null);
  const [phase, setPhase] = useState<Phase>("childhood");
  const [live, setLive] = useState(false);
  const wasPaused = useRef(false);

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
    es.onerror = () => setLive(false);
    return () => es.close();
  }, [token]);

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

  /* Keyboard controller for the projector. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }

      let action: string | null = null;
      switch (event.key.toLowerCase()) {
        case " ":
        case "spacebar":
          action = snap?.isPaused ? "resume" : "pause";
          break;
        case "arrowright":
        case "n":
          action = "next";
          break;
        case "arrowleft":
        case "p":
          action = "previous";
          break;
        case "r":
          action = "replay";
          break;
        case "home":
          action = "restart";
          break;
        case "end":
          action = "stop";
          break;
        case "s":
          action = "start";
          break;
        default:
          return;
      }
      event.preventDefault();
      void sendPresentationAction(action);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [snap?.isPaused]);

  const seq = snap?.sequenceVersion;
  const status = snap?.status;
  const pid = snap?.participant?.id;
  const showAdult = phase === "adult" || phase === "name" || phase === "done";

  // New participant => hard reset to childhood before smoke.
  useEffect(() => {
    if (!snap || status !== "RUNNING" || !snap.participant || snap.isPaused) return;
    setPhase("childhood");
    const t = setTimeout(() => setPhase("smoke"), snap.childhoodDuration);
    return () => clearTimeout(t);
  }, [seq, pid, status, snap?.isPaused, snap?.childhoodDuration]);

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

  useEffect(() => {
    const paused = !!snap?.isPaused;
    if (paused && !wasPaused.current) {
      setPhase((ph) => (ph === "smoke" ? "childhood" : ph));
    }
    wasPaused.current = paused;
  }, [snap?.isPaused]);

  const idle = !snap || snap.status === "IDLE";
  const finished = snap?.status === "FINISHED";

  return (
    <main className="relative flex h-dvh select-none items-center justify-center overflow-hidden bg-night-950">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-20%] right-1/2 h-[70vh] w-[110vw] translate-x-1/2 rounded-[100%] bg-[radial-gradient(ellipse_at_center,rgba(212,175,55,0.14),transparent_60%)] blur-2xl" />
        <div className="absolute bottom-[-30%] right-1/2 h-[50vh] w-[80vw] translate-x-1/2 rounded-[100%] bg-[radial-gradient(ellipse_at_center,rgba(90,60,160,0.12),transparent_65%)] blur-3xl" />
      </div>

      {/* Next graduate preview: image and name only. */}
      {!idle && !finished && snap?.nextParticipant && (
        <aside
          key={`next-${snap.nextParticipant.id}-${snap.sequenceVersion}`}
          className="absolute left-5 top-1/2 z-30 hidden w-28 -translate-y-1/2 md:block"
          aria-label="الخريج التالي"
        >
          <div className="rounded-2xl border border-gold-500/20 bg-night-950/75 p-2.5 shadow-[0_0_30px_-12px_rgba(212,175,55,0.35)] backdrop-blur-sm">
            <div className="overflow-hidden rounded-xl bg-night-900">
              {snap.nextParticipant.childhoodImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={snap.nextParticipant.childhoodImageUrl}
                  alt=""
                  className="h-24 w-full object-cover"
                />
              ) : (
                <div className="flex h-24 items-center justify-center text-gold-500/40">
                  <GraduationCap className="size-8" />
                </div>
              )}
            </div>
            <p className="mt-2 truncate text-center font-display text-xs font-bold text-gold-200">
              {snap.nextParticipant.name}
            </p>
          </div>
        </aside>
      )}

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

      {idle && (
        <div className="relative z-10 flex flex-col items-center px-6 text-center animate-fade-in">
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

      {finished && (
        <div className="relative z-10 flex flex-col items-center px-6 text-center animate-fade-in">
          <GraduationCap className="mb-8 size-20 text-gold-400" />
          <h1 className="font-display text-5xl font-bold sm:text-7xl">
            <span className="gold-text animate-shimmer">مبروك التخرج</span>
          </h1>
          <p className="mt-5 font-display text-2xl text-ivory/70">لكل بطل شاركنا لحظته النهاردة</p>
        </div>
      )}

      {!idle && !finished && snap?.participant && (
        <div key={snap.sequenceVersion} className="relative z-10 flex h-full flex-col items-center justify-center gap-5 px-4">
          <div className="relative animate-fade-up">
            <div className="absolute -top-9 right-1/2 z-30 translate-x-1/2">
              <span className="flex size-18 items-center justify-center rounded-full border-2 border-gold-500/70 bg-night-900 shadow-[0_0_40px_-6px_rgba(212,175,55,0.55)]">
                <GraduationCap className="size-9 text-gold-400" />
              </span>
            </div>

            <div className="lux-frame lux-corner relative overflow-hidden rounded-[28px] p-2.5">
              <div className="relative h-[58dvh] w-[min(82vw,46dvh)] overflow-hidden rounded-2xl bg-night-900">
                {snap.participant.childhoodImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`childhood-${snap.sequenceVersion}-${snap.participant.id}`}
                    src={snap.participant.childhoodImageUrl}
                    alt=""
                    className={`photo-old absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-out ${showAdult ? "opacity-0" : "opacity-100"}`}
                  />
                )}
                {snap.participant.graduationImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`adult-${snap.sequenceVersion}-${snap.participant.id}`}
                    src={snap.participant.graduationImageUrl}
                    alt=""
                    className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-out ${showAdult ? "opacity-100" : "opacity-0"}`}
                  />
                )}
                <div className="pointer-events-none absolute inset-0 z-10 shadow-[inset_0_0_80px_20px_rgba(0,0,0,0.55)]" />
                {phase === "smoke" && !snap.isPaused && (
                  <SmokeCanvas
                    key={`smoke-${snap.sequenceVersion}`}
                    durationMs={snap.smokeDuration}
                    onMidpoint={() => setPhase("adult")}
                    onDone={() => setPhase("adult")}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="h-26">
            {(phase === "name" || phase === "done") && (
              <div key={`name-${snap.sequenceVersion}`} className="animate-name-reveal relative">
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
