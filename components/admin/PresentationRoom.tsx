"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDraftContext } from "@/components/admin/DraftProvider";
import { Badge, Button, InlineMessage, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/web/api";
import type { ControlRoomSnapshot } from "@/lib/web/admin";

type Command = "start" | "pause" | "resume" | "next" | "previous" | "replay" | "skip" | "jump" | "restart";

export default function PresentationRoom() {
  const draft = useDraftContext();
  const [snap, setSnap] = useState<ControlRoomSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [projectorUrl, setProjectorUrl] = useState<string | null>(null);
  const [editingNext, setEditingNext] = useState(false);
  const [nextName, setNextName] = useState("");

  const load = useCallback(async () => {
    try {
      const s = await api.get<ControlRoomSnapshot>("/api/admin/presentation");
      setSnap(s);
      setNextName((s.next?.fullName ?? ""));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذر تحميل غرفة العرض.");
    }
  }, []);

  const loadProjector = useCallback(async () => {
    try {
      const res = await api.get<{ url: string | null }>("/api/admin/presentation/token");
      setProjectorUrl(res.url);
    } catch {}
  }, []);

  useEffect(() => {
    void load();
    void loadProjector();
    const es = new EventSource("/api/realtime/stream");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.addEventListener("message", (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as { event?: string };
        if (data.event === "snapshot" || data.event === "update") void load();
      } catch {}
    });
    return () => es.close();
  }, [load, loadProjector]);

  async function command(cmd: Command, participantId?: string) {
    setBusy(cmd);
    setError(null);
    try {
      const res = await api.post<{ snapshot: ControlRoomSnapshot }>("/api/admin/presentation", { command: cmd, participantId });
      setSnap(res.snapshot);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذر تحديث العرض.");
    } finally {
      setBusy(null);
    }
  }

  async function openProjector() {
    let url = projectorUrl;
    if (!url) {
      try {
        const res = await api.get<{ url: string | null }>("/api/admin/presentation/token");
        url = res.url;
        setProjectorUrl(url);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "لا يوجد رابط لشاشة العرض.");
        return;
      }
    }
    if (!url) {
      setError("أنشئ رابط شاشة العرض أولًا من الإعدادات.");
      return;
    }
    window.open(url, "graduation-projector", "popup=yes,width=1440,height=900");
  }

  async function saveNextName() {
    if (!snap?.next) return;
    const clean = nextName.trim().replace(/\s+/g, " ");
    if (!clean || clean === snap.next.fullName) {
      setEditingNext(false);
      return;
    }
    setBusy("name");
    try {
      await api.post("/api/admin/drafts", { participantId: snap.next.id, field: "fullName", newValue: clean });
      await draft.refresh();
      setEditingNext(false);
      setSnap((s) => s ? { ...s, next: s.next ? { ...s.next, fullName: clean } : null } : s);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذر تعديل الاسم.");
    } finally {
      setBusy(null);
    }
  }

  const queue = useMemo(() => snap?.queue ?? [], [snap]);
  const current = snap?.current ?? null;
  const next = snap?.next ?? null;
  const playback = snap?.state.playback ?? "IDLE";

  if (!snap) return <div className="capital-page flex min-h-[60vh] items-center justify-center"><Spinner /></div>;

  return (
    <div className="capital-page min-h-[calc(100vh-2rem)] space-y-6 rounded-[2rem] p-2 sm:p-5">
      <header className="capital-glass flex flex-wrap items-center justify-between gap-4 rounded-3xl p-5">
        <div>
          <p className="text-xs font-semibold tracking-[.18em] text-[#B6992F]">جامعة العاصمة • حفل التخرج</p>
          <h1 className="font-display mt-1 text-2xl font-bold text-[#00236C]">غرفة التحكم في العرض</h1>
          <p className="mt-1 text-sm text-slate-500">تحكم في ترتيب الخريجين، وشغّل شاشة العرض، وراجع الاسم القادم قبل ظهوره.</p>
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500"><span className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-400"}`} />{connected ? "متصل لحظيًا" : "جاري إعادة الاتصال"}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void openProjector()} className="!bg-[#00236C]">فتح شاشة العرض ↗</Button>
          <Link href="/admin/settings" className="inline-flex h-10 items-center rounded-xl border border-[#00236C]/15 bg-white/55 px-4 text-sm font-semibold text-[#00236C] backdrop-blur">الإعدادات</Link>
        </div>
      </header>

      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}

      <section className="capital-glass rounded-3xl p-5">
        <div className="flex flex-wrap items-center gap-2">
          {playback === "IDLE" || !current ? <Button onClick={() => void command("start")} loading={busy === "start"} disabled={!queue.length}>▶ بدء العرض</Button> : snap.state.isPaused ? <Button onClick={() => void command("resume")} loading={busy === "resume"}>▶ استئناف</Button> : <Button variant="secondary" onClick={() => void command("pause")} loading={busy === "pause"}>⏸ إيقاف مؤقت</Button>}
          <Button variant="secondary" onClick={() => void command("previous")} disabled={!current}>السابق</Button>
          <Button variant="secondary" onClick={() => void command("replay")} disabled={!current}>↻ إعادة الشريحة</Button>
          <Button variant="secondary" onClick={() => void command("skip")} disabled={!current}>تخطي الخريج</Button>
          <Button onClick={() => void command("next")} disabled={!current}>التالي ←</Button>
          <span className="mr-auto rounded-full border border-[#B6992F]/25 bg-[#B6992F]/10 px-3 py-1 text-xs font-semibold text-[#705b16]">{snap.state.mode === "AUTOMATIC" ? "تشغيل تلقائي" : "تحكم يدوي"}</span>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
        <section className="capital-glass rounded-3xl p-5">
          <div className="mb-5 flex items-center justify-between"><div><h2 className="font-display text-xl font-bold text-[#00236C]">الخريج الحالي</h2><p className="text-xs text-slate-500">هذا هو الوحيد الذي يظهر على البروجكتور.</p></div><Badge tone="gold">{current ? "على الشاشة" : "في الانتظار"}</Badge></div>
          {current ? <div className="grid gap-5 md:grid-cols-[280px_1fr] md:items-center"><div className="relative aspect-square overflow-hidden rounded-3xl border border-[#B6992F]/45 bg-[#00236C] shadow-2xl">{current.graduationThumb || current.childhoodThumb ? <img src={current.graduationThumb || current.childhoodThumb || ""} alt="" className="h-full w-full object-cover" /> : null}<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#00236C]/90 to-transparent p-5"><span className="text-xs text-[#d9c77c]">الخريج الحالي</span></div></div><div><p className="font-display text-4xl font-bold text-[#00236C]">{current.fullName}</p><p className="mt-3 text-sm text-slate-500">الحالة: {playback === "RUNNING" ? "يتم العرض الآن" : playback === "PAUSED" ? "متوقف مؤقتًا" : "جاهز"}</p><div className="mt-5 rounded-2xl border border-[#00236C]/10 bg-white/50 p-4 text-sm text-slate-600">على شاشة العرض سيظهر <strong>الصورة والاسم فقط</strong> بدون أي أزرار أو قوائم تحكم.</div></div></div> : <div className="flex min-h-72 items-center justify-center text-sm text-slate-400">ابدأ العرض لعرض أول خريج.</div>}
        </section>

        <section className="capital-glass rounded-3xl p-5">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="font-display text-xl font-bold text-[#00236C]">الخريج القادم</h2><p className="text-xs text-slate-500">راجعه وعدّل الاسم قبل العرض.</p></div>{next ? <span className="rounded-full bg-[#B6992F]/10 px-3 py-1 text-xs font-bold text-[#705b16]">التالي</span> : null}</div>
          {next ? <div className="space-y-4"><div className="aspect-square overflow-hidden rounded-2xl border border-[#00236C]/10 bg-white/50">{next.graduationThumb ? <img src={next.graduationThumb} alt="" className="h-full w-full object-cover" /> : null}</div>{editingNext ? <div className="space-y-2"><input value={nextName} onChange={(e) => setNextName(e.target.value)} autoFocus dir="auto" className="h-12 w-full rounded-xl px-4 font-semibold" /><div className="flex gap-2"><Button size="sm" onClick={() => void saveNextName()} loading={busy === "name"}>حفظ الاسم</Button><Button size="sm" variant="secondary" onClick={() => { setNextName(next.fullName); setEditingNext(false); }}>إلغاء</Button></div></div> : <div><p className="font-display text-2xl font-bold text-[#00236C]">{next.fullName}</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => setEditingNext(true)}>تعديل الاسم</Button><Button size="sm" onClick={() => void command("jump", next.id)}>عرض الآن</Button><Link href={`/admin/participants/${next.id}`} className="inline-flex h-9 items-center rounded-lg border border-[#00236C]/15 px-3 text-xs font-semibold text-[#00236C]">فتح الملف</Link></div></div>}</div> : <div className="py-16 text-center text-sm text-slate-400">لا يوجد خريج قادم.</div>}
        </section>
      </div>

      <section className="capital-glass rounded-3xl p-5">
        <div className="mb-4 flex items-end justify-between"><div><h2 className="font-display text-xl font-bold text-[#00236C]">ترتيب الخريجين</h2><p className="text-xs text-slate-500">استخدم الأسهم لتغيير الترتيب أو اضغط «عرض الآن» لتجاوز الترتيب.</p></div><span className="text-xs text-slate-400">{queue.length} خريج</span></div>
        <div className="space-y-2">
          {queue.map((entry, i) => <div key={entry.id} className={`flex items-center gap-3 rounded-2xl border p-3 ${entry.id === current?.id ? "border-[#B6992F]/55 bg-[#B6992F]/10" : "border-[#00236C]/10 bg-white/45"}`}><span className="w-7 text-center text-sm font-bold text-slate-400">{i + 1}</span><div className="h-12 w-12 overflow-hidden rounded-xl bg-[#00236C]/5">{entry.graduationThumb ? <img src={entry.graduationThumb} alt="" className="h-full w-full object-cover" /> : null}</div><div className="min-w-0 flex-1"><p className="truncate font-semibold text-[#00236C]">{entry.fullName}</p><p className="text-[11px] text-slate-400">{entry.presentationStatus === "PRESENTED" ? "تم العرض" : entry.id === current?.id ? "على الشاشة الآن" : "في الانتظار"}</p></div>{entry.id !== current?.id && entry.presentationStatus !== "PRESENTED" ? <Button size="sm" variant="secondary" onClick={() => void command("jump", entry.id)}>عرض الآن</Button> : null}</div>)}
        </div>
      </section>
    </div>
  );
}
