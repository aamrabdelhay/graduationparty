"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { StatCard } from "@/components/admin/StatCard";
import { InlineMessage, SectionTitle } from "@/components/ui";
import { api } from "@/lib/web/api";
import type { AdminStats } from "@/lib/web/admin";

export default function Dashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [notice, setNotice] = useState<{ count: number } | null>(null);
  const load = useCallback(async () => { const [s,n]=await Promise.all([api.get<AdminStats>("/api/admin/stats").catch(()=>null),api.get<{notice:{count:number}|null}>("/api/admin/notice").catch(()=>null)]); setStats(s); setNotice(n?.notice??null); },[]);
  useEffect(()=>{void load();},[load]);
  return <div className="space-y-8">
    <div className="flex flex-wrap items-end justify-between gap-4"><SectionTitle sub="نظرة شاملة على جميع الخريجين وحالة العرض.">لوحة التحكم</SectionTitle><div className="flex gap-2"><Link href="/admin/participants?add=1" className="inline-flex h-11 items-center rounded-xl bg-[#641F2B] px-5 text-sm font-semibold text-white shadow-lg">+ إضافة خريج</Link><Link href="/admin/presentation" className="inline-flex h-11 items-center rounded-xl border border-[#34465d] bg-[#18263A] px-5 text-sm font-semibold text-[#F7F5F0]">فتح غرفة التحكم</Link></div></div>
    {notice?<InlineMessage tone="info">لديك <strong>{notice.count}</strong> من التغييرات غير المحفوظة من جلستك السابقة.</InlineMessage>:null}
    {!stats?<div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({length:8}).map((_,i)=><div key={i} className="skeleton h-[86px] rounded-xl"/>)}</div>:<>
      <section aria-label="المشاركات"><h2 className="mb-3 text-xs font-semibold tracking-widest text-[#A8A39A]">المشاركات</h2><div className="grid grid-cols-2 gap-3 md:grid-cols-4"><StatCard label="إجمالي الخريجين" value={stats.totalParticipants}/><StatCard label="إجمالي المجموعات" value={stats.totalGroups}/><StatCard label="المشاركات الفردية" value={stats.individuals}/><StatCard label="المشاركات الجماعية" value={stats.groups}/></div></section>
      <section aria-label="إنشاء صور التخرج"><h2 className="mb-3 text-xs font-semibold tracking-widest text-[#A8A39A]">صور التخرج بالذكاء الاصطناعي</h2><div className="grid grid-cols-2 gap-3 md:grid-cols-4"><StatCard label="اكتملت" value={stats.completedAi} tone="ok"/><StatCard label="قيد الانتظار" value={stats.pendingAi} tone="warn"/><StatCard label="جارٍ التنفيذ" value={stats.processingAi}/><StatCard label="فشلت — يمكن المحاولة مجددًا" value={stats.failedAi} tone="danger"/></div></section>
      <section aria-label="العرض"><h2 className="mb-3 text-xs font-semibold tracking-widest text-[#A8A39A]">حالة العرض</h2><div className="grid grid-cols-2 gap-3 md:grid-cols-4"><StatCard label="في الانتظار" value={stats.queued}/><StatCard label="يُعرض الآن" value={stats.current} tone="gold"/><StatCard label="تم العرض" value={stats.presented} tone="ok"/><StatCard label="تم التخطي" value={stats.skipped} tone="warn"/></div></section>
      {(stats.failedAi>0||stats.pendingAi>0)?<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#8A6A3A]/30 bg-[#8A6A3A]/10 px-4 py-3"><p className="text-sm text-[#D7C6A5]">هناك {stats.pendingAi+stats.failedAi} صورة تخرج تحتاج إلى الإنشاء أو إعادة المحاولة.</p><Link href="/admin/participants?filter=pending" className="text-sm font-semibold text-[#D7B979] underline underline-offset-4">مراجعة الخريجين</Link></div>:null}
    </>}
  </div>;
}
