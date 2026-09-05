"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadDraft } from "@/lib/web/submission";

export default function Landing() {
  const [hasDraft, setHasDraft] = useState(false);
  useEffect(() => setHasDraft(Boolean(loadDraft())), []);

  return (
    <main id="main-content" className="luxury-landing min-h-[100dvh] overflow-hidden px-4 py-5 sm:px-8 sm:py-8">
      <div className="luxury-shell relative mx-auto flex min-h-[calc(100dvh-2.5rem)] max-w-6xl flex-col overflow-hidden sm:min-h-[calc(100dvh-4rem)]">
        <div className="luxury-orb luxury-orb-gold" aria-hidden />
        <div className="luxury-orb luxury-orb-burgundy" aria-hidden />

        <header className="luxury-header relative z-10 flex items-center justify-between px-6 py-7 sm:px-12 sm:py-9">
          <div className="flex items-center gap-4">
            <div className="luxury-monogram">ع</div>
            <div className="text-right leading-tight">
              <p className="text-[10px] font-semibold tracking-[0.12em] text-[#b09b82]">جامعة العاصمة</p>
              <p className="font-display mt-1 text-lg font-semibold text-[#f7f1e7]">احتفال التخرج</p>
            </div>
          </div>
          <span className="luxury-year">دفعة {new Date().getFullYear()}</span>
        </header>

        <section className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-6 pb-14 pt-8 text-center sm:px-10">
          <div className="luxury-kicker">لحظة تستحق أن تبقى</div>
          <p className="mt-7 font-display text-sm font-medium tracking-[0.12em] text-[#c7a66a] sm:text-base">رحلة من الطفولة إلى التخرج</p>
          <h1 className="mt-5 max-w-4xl font-display text-4xl font-semibold leading-[1.18] tracking-tight text-[#f8f2e8] sm:text-7xl">حفلة تخرج جامعة العاصمة</h1>
          <p className="mt-7 max-w-2xl text-sm leading-8 text-[#c9c0b4] sm:text-lg sm:leading-9">شارك ذكرياتك وصورتك في رحلة احتفالية تُعرض على الشاشة الكبيرة في ليلة التخرج.</p>

          <div className="mt-12 grid w-full max-w-3xl gap-4 sm:grid-cols-2">
            <Link href="/add?type=individual" className="luxury-action group">
              <span className="luxury-action-number">٠١</span>
              <span className="font-display text-xl font-semibold text-[#f8f2e8]">أضف بياناتي</span>
              <span className="text-xs leading-6 text-[#a99e92]">خريج واحد، وذكريات تستحق أن تُعرض.</span>
              <span className="luxury-action-link">ابدأ الآن <span className="transition-transform duration-300 group-hover:-translate-x-1">←</span></span>
            </Link>
            <Link href="/add?type=group" className="luxury-action group">
              <span className="luxury-action-number">+</span>
              <span className="font-display text-xl font-semibold text-[#f8f2e8]">أضف أصدقائي</span>
              <span className="text-xs leading-6 text-[#a99e92]">أنشئ مشاركة جماعية لزملائك في الدفعة.</span>
              <span className="luxury-action-link">إنشاء مجموعة <span className="transition-transform duration-300 group-hover:-translate-x-1">←</span></span>
            </Link>
          </div>

          {hasDraft ? <Link href="/add?resume=1" className="mt-8 text-xs text-[#9f958a] underline-offset-8 transition hover:text-[#d4b87a] hover:underline">استكمال ما بدأت به</Link> : null}
        </section>

        <footer className="luxury-footer relative z-10 flex flex-col items-center justify-between gap-4 px-6 py-6 text-center sm:flex-row sm:px-12">
          <p className="text-[10px] leading-5 text-[#82786d]">تُستخدم الصور لأغراض احتفال التخرج فقط، ويمكن طلب حذفها.</p>
          <Link href="/admin/login" aria-label="فتح لوحة الإدارة" className="luxury-admin-link">لوحة الإدارة <span>↙</span></Link>
        </footer>
      </div>
    </main>
  );
}
