"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadDraft } from "@/lib/web/submission";

export default function Landing() {
  const [hasDraft, setHasDraft] = useState(false);
  useEffect(() => {
    setHasDraft(Boolean(loadDraft()));
  }, []);

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-ink-950 text-white">
      {/* Subtle backdrop: soft light from above */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[480px] w-[900px] -translate-x-1/2 rounded-[100%] bg-gold-500/15 blur-[120px]" />
        <div className="absolute bottom-0 left-0 h-[300px] w-[500px] rounded-[100%] bg-ink-700/40 blur-[110px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_0%,rgba(4,10,18,0.55)_75%)]" />
      </div>

      <div className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-6 py-14 text-center">
        <p className="font-display text-sm font-medium uppercase tracking-[0.35em] text-gold-400">Class of {new Date().getFullYear()}</p>
        <h1 className="font-display mt-4 text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
          Graduation Party
        </h1>
        <p className="mt-5 max-w-xl text-balance text-base leading-relaxed text-slate-300 sm:text-lg">
          Share the journey — from childhood to this moment. Add your name and two photos, and we will
          place your graduation cap on your grown-up photo for the big screen.
        </p>

        <div className="mt-12 grid w-full max-w-2xl gap-4 sm:grid-cols-2">
          <Link
            href="/add?type=individual"
            className="group flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-8 py-10 backdrop-blur transition-colors hover:border-gold-400/50 hover:bg-white/[0.09] focus-visible:outline-2 focus-visible:outline-gold-400"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gold-500 text-2xl font-bold text-ink-950 transition-transform group-hover:scale-105">
              1
            </span>
            <span className="font-display text-xl font-semibold">Add myself only</span>
            <span className="text-sm text-slate-400">One graduate, one spot on the screen.</span>
          </Link>

          <Link
            href="/add?type=group"
            className="group flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-8 py-10 backdrop-blur transition-colors hover:border-gold-400/50 hover:bg-white/[0.09] focus-visible:outline-2 focus-visible:outline-gold-400"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full border border-gold-400 text-2xl font-semibold text-gold-400 transition-transform group-hover:scale-105">
              +
            </span>
            <span className="font-display text-xl font-semibold">Add myself and my friends</span>
            <span className="text-sm text-slate-400">Graduate together — one shared group entry.</span>
          </Link>
        </div>

        {hasDraft ? (
          <Link
            href="/add?resume=1"
            className="mt-8 text-sm text-slate-400 underline decoration-slate-600 underline-offset-4 hover:text-gold-300"
          >
            Continue where you left off
          </Link>
        ) : null}
      </div>

      <div className="relative flex items-center justify-center gap-4 pb-6">
        <Link
          href="/admin/login"
          className="rounded-full border border-white/10 px-4 py-2 text-xs font-medium text-slate-400 transition hover:border-gold-400/40 hover:text-gold-300 focus-visible:outline-2 focus-visible:outline-gold-400"
        >
          Admin
        </Link>
        <p className="text-xs text-slate-600">Photos are used only for this celebration and removed on request.</p>
      </div>
    </div>
  );
}
