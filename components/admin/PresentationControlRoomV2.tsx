"use client";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, InlineMessage, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/web/api";
import type { ControlRoomSnapshot } from "@/lib/web/admin";

type Command = "start" | "pause" | "resume" | "next" | "previous" | "replay" | "skip" | "jump" | "restart";
type Skipped = { id: string; fullName: string; thumb: string | null };

export default function PresentationControlRoomV2() {
  const [snap, setSnap] = useState<ControlRoomSnapshot | null>(null);
  const [skipped, setSkipped] = useState<Skipped[]>([]);
  const [projectorUrl, setProjectorUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, sk, token] = await Promise.all([
        api.get<ControlRoomSnapshot>("/api/admin/presentation"),
        api.get<{ skipped: Skipped[] }>("/api/admin/presentation/skipped"),
        api.get<{ url: string | null }>("/api/admin/presentation/token"),
      ]);
      setSnap(s); setSkipped(sk.skipped); setProjectorUrl(token.url);
    } catch (e) { setError(e instanceof ApiError ? e.message : "تعذر تحميل العرض."); }
  }, []);

  useEffect(() => { void load(); const id = window.setInterval(() => void load(), 3000); return () => window.clearInterval(id); }, [load]);

  async function command(command: Command, participantId?: string) {
    setBusy(command); setError(null);
    try { const r = await api.post<{ snapshot: ControlRoomSnapshot }>("/api/admin/presentation", { command, participantId }); setSnap(r.snapshot); const sk = await api.get<{ skipped: Skipped[] }>("/api/admin/presentation/skipped"); setSkipped(sk.skipped); }
    catch (e) { setError(e instanceof ApiError ? e.message : "تعذر تنفيذ الأمر."); }
    finally { setBusy(null); }
  }

  async function launch() {
    const popup = window.open("about:blank", "graduation-projector", "popup=yes,width=1440,height=900");
    if (!popup) { setError("اسمح بالنوافذ المنبثقة لهذا الموقع."); return; }
    try {
      let url = projectorUrl;
      if (!url) { const r = await api.get<{ url: string | null }>("/api/admin/presentation/token"); url = r.url; }
      if (!url) { popup.close(); setError("أنشئ رابط شاشة العرض من الإعدادات."); return; }
      if (!snap?.current || snap.state.playback === "IDLE" || snap.state.playback === "FINISHED") {
        const r = await api.post<{ snapshot: ControlRoomSnapshot }>("/api/admin/presentation", { command: "start" }); setSnap(r.snapshot);
      }
      popup.location.href = url; popup.focus();
    } catch (e) { popup.close(); setError(e instanceof ApiError ? e.message : "تعذر فتح العرض."); }
  }

  if (!snap) return <div className="capital-page flex min-h-[60vh] items-center justify-center"><Spinner /></div>;
  const current = snap.current; const next = snap.next; const queue = snap.queue ?? [];

  return <main className="capital-page min-h-screen space-y-5 p-3 sm:p-6">
    <header className="capital-glass flex flex-wrap items-center justify-between gap-4 rounded-3xl p-5"><div><p className="text-xs font-semibold text-[#B6992F]">جامعة العاصمة • حفل التخرج</p><h1 className="font-display text-2xl font-bold text-[#00236C]">Presentation</h1><p className="text-sm text-slate-500">اضغط تشغيل العرض لفتح شاشة مستقلة وبدء الخريجين تلقائيًا.</p></div><Button onClick={() => void launch()} className="!bg-[#00236C]">▶ تشغيل العرض</Button></header>
    {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
    <section className="capital-glass rounded-3xl p-4"><div className="flex flex-wrap gap-2"><Button onClick={() => void command("start")} disabled={!queue.length}>▶ بدء</Button><Button variant="secondary" onClick={() => void command("previous")} disabled={!current}>السابق</Button><Button variant="secondary" onClick={() => void command("replay")} disabled={!current}>↻ إعادة</Button><Button variant="secondary" onClick={() => void command("skip")} disabled={!current}>تخطي</Button><Button onClick={() => void command("next")} disabled={!current}>التالي</Button><Button variant="secondary" onClick={() => void command("restart")}>من البداية</Button></div></section>
    <div className="grid gap-5 lg:grid-cols-2"><section className="capital-glass rounded-3xl p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-display text-xl font-bold text-[#00236C]">على الشاشة الآن</h2><Badge tone="gold">{current ? "LIVE" : "انتظار"}</Badge></div>{current ? <><div className="aspect-square overflow-hidden rounded-3xl bg-[#00236C]">{current.graduationThumb ? <img src={current.graduationThumb} alt="" className="h-full w-full object-cover" /> : null}</div><p className="mt-4 font-display text-3xl font-bold text-[#00236C]">{current.fullName}</p></> : <p className="py-20 text-center text-slate-400">اضغط تشغيل العرض.</p>}</section><section className="capital-glass rounded-3xl p-5"><h2 className="font-display text-xl font-bold text-[#00236C]">الخريج القادم</h2>{next ? <div className="mt-4 space-y-4"><div className="aspect-square overflow-hidden rounded-3xl">{next.graduationThumb ? <img src={next.graduationThumb} alt="" className="h-full w-full object-cover" /> : null}</div><p className="font-display text-2xl font-bold text-[#00236C]">{next.fullName}</p><Button onClick={() => void command("jump", next.id)}>عرض الآن</Button></div> : <p className="py-20 text-center text-slate-400">لا يوجد خريج قادم.</p>}</section></div>
    {skipped.length ? <section className="capital-glass rounded-3xl p-5"><h2 className="font-display text-xl font-bold text-[#00236C]">تم تخطيهم — يمكن إرجاعهم</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{skipped.map((x) => <div key={x.id} className="flex items-center gap-3 rounded-2xl border border-[#B6992F]/30 p-3"><div className="h-12 w-12 overflow-hidden rounded-xl">{x.thumb ? <img src={x.thumb} alt="" className="h-full w-full object-cover" /> : null}</div><span className="flex-1 font-semibold text-[#00236C]">{x.fullName}</span><Button size="sm" onClick={() => void command("jump", x.id)}>إرجاع</Button></div>)}</div></section> : null}
  </main>;
}
