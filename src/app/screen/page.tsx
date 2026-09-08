"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { GraduationCap, MonitorPlay } from "lucide-react";
import Projector from "@/components/screen/Projector";

function ScreenClient() {
  const params = useSearchParams();
  const queryToken = params.get("token");
  const [token, setToken] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (queryToken) {
      setToken(queryToken);
      try {
        localStorage.setItem("cu_screen_token", queryToken);
      } catch {
        /* noop */
      }
    } else {
      try {
        const saved = localStorage.getItem("cu_screen_token");
        if (saved) setToken(saved);
      } catch {
        /* noop */
      }
    }
    setReady(true);
  }, [queryToken]);

  if (!ready) return null;

  if (!token) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = input.trim();
            if (!v) return;
            try {
              localStorage.setItem("cu_screen_token", v);
            } catch {
              /* noop */
            }
            setToken(v);
          }}
          className="card-lux w-full max-w-md rounded-3xl p-8 text-center"
        >
          <span className="mx-auto mb-5 inline-flex rounded-2xl border border-gold-500/40 bg-gold-500/10 p-4">
            <MonitorPlay className="size-8 text-gold-400" />
          </span>
          <h1 className="font-display text-2xl font-bold">
            <span className="gold-text">شاشة عرض التخرج</span>
          </h1>
          <p className="mt-2 mb-6 text-xs text-ivory/50">
            الصق «رمز العرض» من غرفة الإدارة لتشغيل الشاشة
          </p>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="رمز العرض"
            dir="ltr"
            className="input-lux mb-4 w-full rounded-xl px-4 py-3 text-center text-sm"
          />
          <button className="btn-gold w-full rounded-xl py-3 text-sm">
            تشغيل الشاشة
          </button>
        </form>
      </main>
    );
  }

  return <Projector token={token} />;
}

export default function ScreenPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center">
          <GraduationCap className="size-10 animate-float-slow text-gold-500/60" />
        </main>
      }
    >
      <ScreenClient />
    </Suspense>
  );
}
