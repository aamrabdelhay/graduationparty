"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button, InlineMessage, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/web/api";

export default function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => { api.get<{ authed: boolean }>("/api/admin/session").then((r) => { if (r.authed) router.replace("/admin"); }).catch(() => undefined).finally(() => setChecked(true)); }, [router]);
  useEffect(() => { if (cooldown <= 0) return; const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000); return () => clearInterval(t); }, [cooldown]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault(); if (!password || busy || cooldown > 0) return; setBusy(true); setError(null);
    try { await api.post("/api/admin/login", { password }); router.replace("/admin"); }
    catch (err) {
      if (err instanceof ApiError && err.status === 429) { const retry = (err.body as { retryAfterSeconds?: number })?.retryAfterSeconds; setCooldown(retry ?? 30); setError(`محاولات كثيرة غير ناجحة. حاول مرة أخرى بعد ${retry ?? 30} ثانية.`); }
      else setError(err instanceof ApiError ? err.message : "تعذر تسجيل الدخول. حاول مرة أخرى.");
      setPassword("");
    } finally { setBusy(false); }
  }
  if (!checked) return <div className="mt-10 flex justify-center"><Spinner className="h-6 w-6 border-2" /></div>;

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-[0_20px_60px_rgba(0,0,0,.16)] backdrop-blur-2xl">
      <label htmlFor="admin-password" className="block text-sm font-medium text-slate-200">كلمة المرور</label>
      <input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy || cooldown > 0} placeholder="••••••••" className="h-12 w-full rounded-xl border border-white/15 bg-white/10 px-4 text-base text-white placeholder:text-slate-500 focus:border-[#B6992F] focus:outline-none focus:ring-2 focus:ring-[#B6992F]/40 disabled:opacity-60" />
      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
      {cooldown > 0 ? <p className="text-xs text-slate-400">انتظر {cooldown} ثانية قبل المحاولة مرة أخرى.</p> : null}
      <Button type="submit" variant="gold" className="w-full justify-center" loading={busy} disabled={!password}>تسجيل الدخول</Button>
      <p className="text-center text-[11px] text-slate-500">منطقة محمية — للمستخدمين المصرح لهم فقط.</p>
    </form>
  );
}
