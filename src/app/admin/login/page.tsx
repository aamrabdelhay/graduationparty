"use client";

import { useState } from "react";
import {
  Eye,
  EyeOff,
  GraduationCap,
  Keyboard,
  Loader2,
  LockKeyhole,
  ShieldAlert,
  BadgeCheck,
} from "lucide-react";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [stage, setStage] = useState<"idle" | "busy" | "verifying" | "done">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const hasNonLatin = /[^\x20-\x7E]/.test(password);
  const busy = stage === "busy" || stage === "verifying";

  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setStage("busy");
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const j = await res.json().catch(() => ({ ok: false, error: "رد غير متوقع" }));
      if (!j.ok) {
        setStage("idle");
        setError(
          res.status === 429
            ? `محاولات كثيرة جدًا — استنى ${j.retryAfter ?? 120} ثانية وحاول تاني`
            : j.error || "كلمة المرور غير صحيحة",
        );
        return;
      }

      // Verify the session is actually readable before leaving this page —
      // catches browsers/devices that block cookies.
      setStage("verifying");
      const me = await fetch("/api/admin/me", { credentials: "same-origin" });
      if (me.status === 401) {
        setStage("idle");
        setError(
          "كلمة السر صح، بس متصفحك رفض يحفظ الجلسة (الكوكيز ممنوعة). فعّل الكوكيز أو جرّب متصفح تاني.",
        );
        return;
      }

      setStage("done");
      // Hard navigation: guarantees the guard sees the fresh cookie with
      // zero client-router-cache involvement.
      window.location.assign("/admin/dashboard");
      // Fallback if anything stalls.
      setTimeout(() => {
        if (window.location.pathname.endsWith("/login")) {
          window.location.href = "/admin/dashboard";
        }
      }, 2500);
    } catch {
      setStage("idle");
      setError("حدث خطأ في الاتصال — جرّب تاني");
    }
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-5">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 right-1/2 h-100 w-100 translate-x-1/2 rounded-full bg-gold-500/10 blur-[130px]" />
      </div>

      <form
        onSubmit={login}
        className="card-lux lux-frame lux-corner relative z-10 w-full max-w-md animate-fade-up rounded-3xl p-8 sm:p-10"
      >
        <div className="mb-8 text-center">
          <span className="mx-auto mb-5 inline-flex rounded-2xl border border-gold-500/40 bg-gold-500/10 p-4">
            <GraduationCap className="size-9 text-gold-400" />
          </span>
          <h1 className="font-display text-3xl font-bold">
            <span className="gold-text">غرفة الإدارة</span>
          </h1>
          <p className="mt-2 text-xs text-ivory/45">منطقة خاصة بمنظمي الحفل فقط</p>
        </div>

        <label className="mb-2 block text-xs font-bold text-ivory/60">
          كلمة المرور
        </label>
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-gold-400/70" />
          <input
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            autoFocus
            autoComplete="current-password"
            inputMode="text"
            placeholder="••••••"
            className="input-lux w-full rounded-2xl py-3.5 pr-11 pl-12 text-lg tracking-widest"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute top-1/2 left-3 -translate-y-1/2 rounded-lg p-2 text-ivory/40 hover:text-gold-300"
            aria-label="إظهار كلمة المرور"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>

        {hasNonLatin && password.length > 0 && (
          <p className="mt-3 flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-xs font-bold text-amber-200">
            <Keyboard className="size-4 shrink-0" />
            شكلك بتكتب بالعربي — كلمة المرور بالإنجليزي، بدّل لوحة المفاتيح لـ EN
          </p>
        )}

        {error && (
          <p className="mt-4 flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-xs font-bold text-red-200">
            <ShieldAlert className="size-4 shrink-0" /> {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || stage === "done" || !password}
          className="btn-gold mt-7 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base"
        >
          {stage === "done" ? (
            <>
              <BadgeCheck className="size-5" /> تم تسجيل الدخول — جاري تحويلك...
            </>
          ) : busy ? (
            <>
              <Loader2 className="size-5 animate-spin" />
              {stage === "verifying" ? "جاري تجهيز الجلسة..." : "جاري التحقق..."}
            </>
          ) : (
            "دخول"
          )}
        </button>

        {stage === "done" && (
          <p className="mt-4 text-center text-xs text-ivory/50">
            لو لم يتم تحويلك تلقائيًا{" "}
            <a href="/admin/dashboard" className="text-gold-300 underline underline-offset-4">
              اضغط هنا للدخول
            </a>
          </p>
        )}
      </form>
    </main>
  );
}
