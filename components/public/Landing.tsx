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
    <main id="main-content" className="capu-landing min-h-[100dvh] overflow-hidden px-4 py-5 text-white sm:px-6 sm:py-8">
      <div className="capu-phone relative mx-auto flex min-h-[calc(100dvh-2.5rem)] max-w-5xl flex-col overflow-hidden rounded-[2.8rem] border border-white/20 shadow-2xl sm:min-h-[calc(100dvh-4rem)]">
        <div className="capu-glow capu-glow-one" aria-hidden />
        <div className="capu-glow capu-glow-two" aria-hidden />

        <header className="relative z-10 flex items-center justify-between px-6 pb-4 pt-7 sm:px-10 sm:pt-9">
          <div className="flex items-center gap-3">
            <div className="capu-mark flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/10 text-sm font-bold shadow-lg backdrop-blur-xl">CU</div>
            <div className="text-right leading-tight">
              <p className="text-[10px] font-semibold tracking-[0.14em] text-white/55">CAPITAL UNIVERSITY</p>
              <p className="font-display text-lg font-semibold">جامعة العاصمة</p>
            </div>
          </div>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-semibold tracking-[0.08em] text-white/70 backdrop-blur-xl">دفعة {new Date().getFullYear()}</span>
        </header>

        <section className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-6 pb-10 pt-4 text-center sm:px-10">
          <div className="capu-badge mb-6 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-medium text-white/75 shadow-lg backdrop-blur-xl">بداية فصل جديد من الحكاية</div>
          <p className="font-display text-sm font-medium tracking-[0.16em] text-[#dfca7a] sm:text-base">احتفال التخرج</p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-semibold leading-[1.15] tracking-tight sm:text-7xl">حفلة تخرج جامعة العاصمة</h1>
          <p className="mt-6 max-w-2xl text-sm leading-8 text-white/65 sm:text-lg sm:leading-9">شارك رحلتك من الطفولة حتى التخرج، وأضف صورك لتصبح ذكرياتك جزءًا من لحظة احتفال استثنائية على الشاشة الكبيرة.</p>

          <div className="mt-10 grid w-full max-w-2xl gap-4 sm:grid-cols-2">
            <Link href="/add?type=individual" className="capu-action group">
              <span className="capu-action-icon">01</span>
              <span className="font-display text-xl font-semibold text-white">أضف بياناتي</span>
              <span className="text-xs leading-5 text-white/50">خريج واحد، وذكريات تستحق أن تُعرض.</span>
              <span className="mt-1 text-xs font-semibold text-[#dfca7a] transition-transform duration-300 group-hover:-translate-x-1">ابدأ الآن ←</span>
            </Link>
            <Link href="/add?type=group" className="capu-action group">
              <span className="capu-action-icon capu-action-icon-outline">+</span>
              <span className="font-display text-xl font-semibold text-white">أضف أصدقائي</span>
              <span className="text-xs leading-5 text-white/50">أنشئ مشاركة جماعية لزملائك في الدفعة.</span>
              <span className="mt-1 text-xs font-semibold text-[#dfca7a] transition-transform duration-300 group-hover:-translate-x-1">إنشاء مجموعة ←</span>
            </Link>
          </div>

          {hasDraft ? (
            <Link href="/add?resume=1" className="mt-7 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/55 backdrop-blur transition hover:scale-105 hover:bg-white/10 hover:text-white">استكمال ما بدأت به</Link>
          ) : null}
        </section>

        <footer className="relative z-10 flex flex-col items-center justify-between gap-3 border-t border-white/10 px-6 py-5 text-center sm:flex-row sm:px-10">
          <p className="text-[10px] leading-5 text-white/35">تُستخدم الصور لأغراض احتفال التخرج فقط، ويمكن طلب حذفها.</p>
          <Link href="/admin/login" aria-label="فتح لوحة الإدارة" className="capu-admin group flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white/75 shadow-lg backdrop-blur-xl">
            <span className="h-1.5 w-1.5 rounded-full bg-[#dfca7a] shadow-[0_0_10px_rgba(182,153,47,.8)]" />
            لوحة الإدارة
            <span className="transition-transform duration-300 group-hover:-translate-x-0.5">↙</span>
          </Link>
        </footer>
      </div>
    </main>
  );
}
