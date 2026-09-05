"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { DraftProvider, useDraftContext } from "@/components/admin/DraftProvider";
import { Button, Modal, Spinner } from "@/components/ui";
import { api } from "@/lib/web/api";

const NAV = [
  { href: "/admin", label: "الرئيسية", match: /^\/admin$/ },
  { href: "/admin/participants", label: "الخريجون", match: /^\/admin\/participants/ },
  { href: "/admin/groups", label: "المجموعات", match: /^\/admin\/groups/ },
  { href: "/admin/presentation", label: "العرض", match: /^\/admin\/presentation/ },
  { href: "/admin/settings", label: "الإعدادات", match: /^\/admin\/settings/ },
];

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { summary, save, discard, busy } = useDraftContext();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const unsavedCount = summary?.changeCount ?? 0;

  async function doLogout() { setLogoutBusy(true); try { await api.post("/api/admin/logout", { discardUnsaved: false }); router.replace("/admin/login"); } catch { await api.post("/api/admin/logout", { discardUnsaved: true }); router.replace("/admin/login"); } finally { setLogoutBusy(false); } }
  async function saveAndLogout() { setLogoutBusy(true); const { ok } = await save(); if (ok) { try { await api.post("/api/admin/logout", { discardUnsaved: false }); } catch { await api.post("/api/admin/logout", { discardUnsaved: true }); } router.replace("/admin/login"); } else setLogoutBusy(false); }
  async function logoutWithoutSaving() { setLogoutBusy(true); await discard(true); try { await api.post("/api/admin/logout", { discardUnsaved: false }); } catch { await api.post("/api/admin/logout", { discardUnsaved: true }); } router.replace("/admin/login"); setLogoutBusy(false); }
  const openLogout = () => unsavedCount === 0 ? void doLogout() : setLogoutOpen(true);

  return (
    <div className="capital-page min-h-[100dvh]">
      <header className="sticky top-0 z-40 border-b bg-white/70 backdrop-blur-2xl">
        <div className="mx-auto flex min-h-16 max-w-[1500px] items-center gap-5 px-4 py-2 sm:px-6">
          <Link href="/admin" className="flex items-center gap-3 whitespace-nowrap"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#00236C] text-xs font-bold text-white shadow-lg">CU</span><span className="font-display text-lg font-semibold tracking-tight text-[#00236C]">جامعة العاصمة</span><span className="hidden rounded-full bg-[#B6992F]/12 px-2.5 py-1 text-[10px] font-bold text-[#705b16] sm:inline">لوحة الإدارة</span></Link>
          <nav aria-label="التنقل الرئيسي" className="hidden items-center gap-1 md:flex">{NAV.map((item) => { const active = item.match.test(pathname); return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`rounded-xl px-3 py-2 text-sm font-medium transition-all ${active ? "bg-[#00236C]/8 text-[#00236C] shadow-sm" : "text-slate-600 hover:bg-white hover:text-[#00236C]"}`}>{item.label}</Link>; })}</nav>
          <div className="mr-auto flex items-center gap-2"><Link href="/" target="_blank" rel="noreferrer" className="hidden rounded-xl border border-[#00236C]/12 bg-white/60 px-3 py-2 text-xs font-medium text-slate-600 hover:border-[#B6992F]/50 hover:text-[#00236C] sm:block">الموقع العام ↗</Link><button onClick={openLogout} disabled={busy || logoutBusy} className="flex h-10 items-center gap-2 rounded-xl border border-[#00236C]/12 bg-white/55 px-3 text-sm font-medium text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700">{logoutBusy ? <Spinner className="h-3.5 w-3.5 border-2" /> : null} تسجيل الخروج</button></div>
        </div>
        <nav aria-label="التنقل المختصر" className="flex gap-1 overflow-x-auto border-t border-[#00236C]/8 px-3 py-2 md:hidden">{NAV.map((item) => { const active = item.match.test(pathname); return <Link key={item.href} href={item.href} className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-medium ${active ? "bg-[#00236C]/8 text-[#00236C]" : "text-slate-600"}`}>{item.label}</Link>; })}</nav>
      </header>
      <div id="main-content" className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">{children}</div>
      {unsavedCount > 0 ? <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#B6992F]/45 bg-[#00236C]/95 text-white shadow-[0_-10px_40px_rgba(0,35,108,.18)] backdrop-blur-xl"><div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6"><p className="text-sm font-medium">لديك <span className="font-bold text-[#dfca7a]">{unsavedCount}</span> {unsavedCount === 1 ? "تغيير غير محفوظ" : "تغييرات غير محفوظة"}.</p><div className="mr-auto flex items-center gap-2">{busy ? <Spinner className="h-4 w-4 border-2" /> : null}<Button variant="ghost" size="sm" className="text-white hover:bg-white/10" onClick={() => void discard(false)} disabled={busy}>تجاهل التغييرات</Button><Button variant="gold" size="sm" onClick={() => void save()} disabled={busy} loading={busy}>حفظ التغييرات</Button></div></div></div> : null}
      <Modal open={logoutOpen} onClose={() => setLogoutOpen(false)} title="تغييرات غير محفوظة"><p className="text-sm leading-relaxed text-slate-700">لديك <strong>{unsavedCount} تغييرات غير محفوظة</strong>. هل تريد تسجيل الخروج؟</p><div className="mt-5 space-y-2"><Button className="w-full justify-center" onClick={() => void saveAndLogout()} loading={logoutBusy} disabled={busy}>حفظ وتسجيل الخروج</Button><Button variant="secondary" className="w-full justify-center" onClick={() => void logoutWithoutSaving()} loading={logoutBusy}>تسجيل الخروج دون حفظ</Button><Button variant="ghost" className="w-full justify-center" onClick={() => setLogoutOpen(false)} disabled={logoutBusy}>إلغاء</Button></div><p className="mt-3 text-xs text-slate-500">سيتم الاحتفاظ بالتغييرات غير المحفوظة كتذكير عند تسجيل الدخول مرة أخرى.</p></Modal>
    </div>
  );
}

export default function AdminChrome({ children }: { children: ReactNode }) { return <DraftProvider><Shell>{children}</Shell></DraftProvider>; }
