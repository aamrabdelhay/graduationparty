"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

function CapIcon() {
  return (
    <svg width="54" height="54" viewBox="0 0 64 64" aria-hidden className="mx-auto text-gold-500">
      <path d="M32 10 6 24l26 14 26-14L32 10Z" fill="currentColor" />
      <path d="M18 31v10c0 3 6 6 14 6s14-3 14-6V31l-14 7.5L18 31Z" fill="currentColor" opacity="0.85" />
      <path d="M58 24v14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="58" cy="41" r="2.6" fill="currentColor" />
    </svg>
  );
}

export default function SuccessClient() {
  const params = useSearchParams();
  const ref = params.get("ref");

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-ink-950 px-6 py-16 text-white">
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="absolute -top-32 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-[100%] bg-gold-500/15 blur-[120px]" />
      </div>
      <main className="relative mx-auto max-w-xl text-center">
        <CapIcon />
        <h1 className="font-display mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">
          Your submission has been received successfully.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-slate-300">
          Thank you for being part of the celebration. Your photos are safe with us — get ready to see
          yourself on the big screen at the graduation party.
        </p>
        {ref ? <p className="mt-6 font-mono text-xs tracking-wider text-slate-500">Ref · {ref.slice(0, 8)}</p> : null}
        <Link
          href="/"
          className="mt-10 inline-flex h-12 items-center justify-center rounded-lg border border-white/20 px-6 text-sm font-semibold text-white transition-colors hover:border-gold-400 hover:text-gold-300"
        >
          Back to home
        </Link>
      </main>
    </div>
  );
}
