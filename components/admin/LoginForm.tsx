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

  useEffect(() => {
    api
      .get<{ authed: boolean }>("/api/admin/session")
      .then((r) => {
        if (r.authed) router.replace("/admin");
      })
      .catch(() => undefined)
      .finally(() => setChecked(true));
  }, [router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password || busy || cooldown > 0) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/admin/login", { password });
      router.replace("/admin");
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        const retry = (err.body as { retryAfterSeconds?: number })?.retryAfterSeconds;
        setCooldown(retry ?? 30);
        setError(`Too many failed attempts. Try again in ${retry ?? 30} seconds.`);
      } else {
        setError(err instanceof ApiError ? err.message : "Login failed. Please try again.");
      }
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  if (!checked) {
    return (
      <div className="mt-10 flex justify-center">
        <Spinner className="h-6 w-6 border-2" />
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
      <label htmlFor="admin-password" className="block text-sm font-medium text-slate-200">
        Password
      </label>
      <input
        id="admin-password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={busy || cooldown > 0}
        placeholder="••••••••"
        className="h-12 w-full rounded-lg border border-white/15 bg-white/5 px-4 text-base text-white placeholder:text-slate-500 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-500/40 disabled:opacity-60"
      />
      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
      {cooldown > 0 ? (
        <p className="text-xs text-slate-400">Please wait {cooldown} second{cooldown === 1 ? "" : "s"} before trying again.</p>
      ) : null}
      <Button type="submit" variant="gold" className="w-full justify-center" loading={busy} disabled={!password}>
        Sign in
      </Button>
      <p className="text-center text-[11px] text-slate-500">Protected area — authorized personnel only.</p>
    </form>
  );
}
