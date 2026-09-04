import type { Metadata } from "next";
import LoginForm from "@/components/admin/LoginForm";

export const metadata: Metadata = { title: "Admin login" };

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-ink-950 px-4 py-12 text-white">
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="absolute -top-24 left-1/2 h-[320px] w-[700px] -translate-x-1/2 rounded-[100%] bg-gold-500/10 blur-[110px]" />
      </div>
      <main className="relative w-full max-w-sm">
        <p className="font-display text-center text-2xl font-semibold tracking-tight">Graduation Party</p>
        <p className="mt-1 text-center text-sm text-slate-400">Admin sign in</p>
        <LoginForm />
      </main>
    </div>
  );
}
