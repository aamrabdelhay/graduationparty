import type { Metadata } from "next";
import Link from "next/link";
import LoginForm from "@/components/admin/LoginForm";

export const metadata: Metadata = { title: "دخول لوحة الإدارة" };

export default function AdminLoginPage() {
  return (
    <main className="capu-landing flex min-h-[100dvh] items-center justify-center overflow-hidden px-4 py-6 text-white">
      <div className="capu-phone relative w-full max-w-md overflow-hidden rounded-[2.6rem] border border-white/20 px-6 py-10 shadow-2xl sm:px-10">
        <div className="capu-glow capu-glow-one" aria-hidden /><div className="capu-glow capu-glow-two" aria-hidden />
        <div className="relative z-10 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-sm font-bold shadow-lg backdrop-blur-xl">CU</div>
          <p className="mt-5 text-[10px] font-semibold tracking-[0.14em] text-white/45">CAPITAL UNIVERSITY</p>
          <h1 className="mt-2 font-display text-3xl font-semibold">لوحة الإدارة</h1>
          <p className="mt-2 text-sm text-white/50">إدارة منصة احتفال التخرج</p>
          <LoginForm />
          <Link href="/" className="mt-5 inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/50 backdrop-blur transition hover:scale-105 hover:bg-white/10 hover:text-white">العودة إلى الاحتفال ←</Link>
        </div>
      </div>
    </main>
  );
}
