"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Download,
  EyeOff,
  FileSpreadsheet,
  FileText,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Undo2,
  UserPlus,
  UsersRound,
} from "lucide-react";
import UploadField from "@/components/submit/UploadField";
import MemberForm, {
  emptyMember,
  memberFullName,
  memberIsValid,
  MemberData,
} from "@/components/submit/MemberForm";
import {
  AdminGroup,
  AdminParticipant,
  DraftItem,
  Modal,
  Thumb,
  dateTimeFmt,
  statusChip,
  timeFmt,
} from "./shared";

interface Props {
  groups: AdminGroup[];
  participants: AdminParticipant[];
  drafts: DraftItem[];
  draftChange: (
    participantId: string,
    field: string,
    newValue: string | null,
    quiet?: boolean,
  ) => Promise<void>;
  moveParticipant: (p: AdminParticipant, dir: -1 | 1) => Promise<void>;
  refreshParticipants: () => Promise<void>;
  showToast: (msg: string) => void;
}

export default function Roster({ groups, participants, drafts, draftChange, moveParticipant, refreshParticipants, showToast }: Props) {
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<{ p: AdminParticipant; kind: "childhood" | "adult" } | null>(null);
  const [replaceValue, setReplaceValue] = useState<any>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addMember, setAddMember] = useState<MemberData>(emptyMember("admin-add"));
  const [addBusy, setAddBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("ar-EG");
    if (!q) return participants;
    return participants.filter((p) => p.fullName.toLocaleLowerCase("ar-EG").includes(q));
  }, [participants, search]);

  const hasDraft = (id: string) => drafts.some((d) => d.participantId === id);

  async function doDelete(p: AdminParticipant) {
    setBusyId(p.id);
    const r = await fetch(`/api/admin/participants/${p.id}`, { method: "DELETE" });
    const j = await r.json();
    setBusyId(null);
    setConfirmDelete(null);
    if (j.ok) {
      if (openId === p.id) setOpenId(null);
      showToast(`تم حذف ${p.fullName} وصوره نهائيًا`);
      await refreshParticipants();
    } else showToast(j.error || "تعذر الحذف");
  }

  async function doRetry(p: AdminParticipant) {
    setBusyId(p.id);
    const r = await fetch(`/api/admin/participants/${p.id}/retry`, { method: "POST" });
    const j = await r.json();
    setBusyId(null);
    if (j.ok) showToast("تم توليد صورة التخرج بنجاح");
    else showToast(j.error || "فشلت المعالجة");
    await refreshParticipants();
  }

  async function commitReplace() {
    if (!replaceTarget || !replaceValue) return;
    const field = replaceTarget.kind === "adult" ? "adultImageUrl" : "childhoodImageUrl";
    await draftChange(replaceTarget.p.id, field, replaceValue.originalUrl, false);
    setReplaceTarget(null);
    setReplaceValue(null);
  }

  async function submitAdd() {
    if (!memberIsValid(addMember) || addBusy) return;
    setAddBusy(true);
    const r = await fetch("/api/admin/participants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: memberFullName(addMember), childhoodUrl: addMember.childhood!.originalUrl, adultUrl: addMember.adult!.originalUrl }),
    });
    const j = await r.json();
    setAddBusy(false);
    if (j.ok) {
      showToast("تمت إضافة الخريج بنجاح");
      setAddOpen(false);
      setAddMember(emptyMember(`admin-add-${Date.now()}`));
      await refreshParticipants();
    } else showToast(j.error || "تعذر الإضافة");
  }

  const lastSubmission = participants.length ? dateTimeFmt.format(new Date(participants[participants.length - 1].submittedAt)) : "—";

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="إجمالي المقدمين" value={String(participants.length)} />
        <Stat label="جروبات" value={String(groups.length)} />
        <Stat label="متخطَّين من العرض" value={String(participants.filter((p) => p.skipped).length)} />
        <Stat label="آخر تقديم" value={lastSubmission} small />
      </section>

      <section className="card-lux flex flex-wrap items-center gap-3 rounded-2xl p-4">
        <p className="flex items-center gap-2 text-sm font-black text-gold-200"><Download className="size-4" /> تحميل الكشوفات</p>
        <span className="mx-auto" />
        <ExportLink href="/api/admin/export?kind=names&format=csv" label="أسامي فقط CSV" icon={<FileText className="size-4" />} />
        <ExportLink href="/api/admin/export?kind=names&format=xlsx" label="أسامي فقط XLSX" icon={<FileSpreadsheet className="size-4" />} />
        <ExportLink href="/api/admin/export?kind=backup&format=csv" label="نسخة كاملة CSV" icon={<FileText className="size-4" />} />
        <ExportLink href="/api/admin/export?kind=backup&format=xlsx" label="نسخة كاملة XLSX" icon={<FileSpreadsheet className="size-4" />} />
        <button onClick={() => setAddOpen(true)} className="btn-gold inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs"><UserPlus className="size-4" /> إضافة خريج من الإدارة</button>
      </section>

      <section className="card-lux rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 focus-within:border-gold-500/40">
            <Search className="size-4 shrink-0 text-gold-400/70" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالاسم..." className="min-w-0 flex-1 bg-transparent text-sm font-bold text-ivory outline-none placeholder:text-ivory/30" />
            {search && <button onClick={() => setSearch("")} className="text-[11px] font-bold text-ivory/40 hover:text-gold-300">مسح</button>}
          </div>
          <p className="text-xs font-bold text-ivory/45">{search ? `نتائج البحث: ${filtered.length} من ${participants.length}` : `إجمالي الكشف: ${participants.length}`}</p>
        </div>
      </section>

      {participants.length === 0 ? (
        <div className="card-lux rounded-3xl p-14 text-center"><UsersRound className="mx-auto mb-4 size-10 text-gold-500/50" /><p className="font-display text-2xl font-bold text-ivory/70">لا توجد تقديمات بعد</p><p className="mt-2 text-xs text-ivory/40">أول ما حد يسجل من الصفحة الرئيسية هيظهر هنا بصورته ووقت تقديمه</p></div>
      ) : filtered.length === 0 ? (
        <div className="card-lux rounded-3xl p-12 text-center"><Search className="mx-auto mb-4 size-9 text-gold-500/40" /><p className="font-display text-xl font-bold text-ivory/70">مفيش اسم مطابق للبحث</p><button onClick={() => setSearch("")} className="btn-ghost mt-4 rounded-xl px-5 py-2.5 text-xs font-bold">مسح البحث</button></div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((p) => {
            const actualIndex = participants.findIndex((x) => x.id === p.id);
            const isOpen = openId === p.id;
            const isFirst = actualIndex === 0;
            const isLast = actualIndex === participants.length - 1;
            const chip = statusChip(p.gradImageStatus);
            return (
              <article key={p.id} className={`overflow-hidden rounded-2xl border transition-all ${isOpen ? "border-gold-400/40 bg-gold-500/[0.04]" : "border-white/10 bg-white/[0.025] hover:border-gold-500/30"} ${p.skipped ? "opacity-60" : ""}`}>
                <button type="button" onClick={() => setOpenId(isOpen ? null : p.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-right" aria-expanded={isOpen}>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-gold-500/30 bg-gold-500/10 text-[11px] font-black text-gold-300">#{actualIndex + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2"><span className="truncate font-display text-lg font-bold text-ivory">{p.fullName}</span>{hasDraft(p.id) && <span className="rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[9px] font-black text-amber-300">مسودة</span>}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-ivory/40"><span>{timeFmt.format(new Date(p.submittedAt))}</span><span>•</span><span>{p.skipped ? "متخطَّى من العرض" : "داخل العرض"}</span><span className={`rounded-full border px-2 py-0.5 ${chip.cls}`}>{chip.label}</span></span>
                  </span>
                  <span className="hidden shrink-0 items-center gap-1 sm:flex" onClick={(e) => e.stopPropagation()}>
                    <IconBtn title="تقديم الترتيب" onClick={() => moveParticipant(p, -1)} disabled={isFirst}><ArrowUp className="size-3.5" /></IconBtn>
                    <IconBtn title="تأخير الترتيب" onClick={() => moveParticipant(p, 1)} disabled={isLast}><ArrowDown className="size-3.5" /></IconBtn>
                  </span>
                  <ChevronDown className={`size-4 shrink-0 text-gold-400/70 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>

                <div className={`${isOpen ? "block" : "hidden"} border-t border-white/10 px-4 pb-4 pt-4`}>
                  <div className="grid gap-4 md:grid-cols-[auto_1fr_auto] md:items-start">
                    <div className="flex gap-3">
                      <Thumb url={p.graduationImageUrl ?? p.adultImageUrl} alt={p.fullName} className="size-28 rounded-2xl border border-gold-500/25 object-cover" />
                      <Thumb url={p.childhoodImageUrl} alt="صورة الطفولة" className="size-28 rounded-2xl border border-white/10 object-cover" />
                    </div>
                    <div className="min-w-0">
                      {editingId === p.id ? (
                        <div className="flex items-center gap-2"><input autoFocus value={editingName} onChange={(e) => setEditingName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { const v = editingName.trim(); if (v && v !== p.fullName) draftChange(p.id, "fullName", v, false); setEditingId(null); } if (e.key === "Escape") setEditingId(null); }} className="input-lux w-full rounded-xl px-3 py-2.5 text-sm font-bold" /><button onClick={() => { const v = editingName.trim(); if (v && v !== p.fullName) draftChange(p.id, "fullName", v, false); setEditingId(null); }} className="rounded-xl bg-gold-500/20 p-2.5 text-gold-300"><Check className="size-4" /></button></div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-2xl font-bold text-ivory">{p.fullName}</h3><button onClick={() => { setEditingId(p.id); setEditingName(p.fullName); }} className="text-ivory/35 hover:text-gold-300" aria-label="تعديل الاسم"><Pencil className="size-4" /></button></div>
                      )}
                      <p className="mt-2 text-xs text-ivory/45">ترتيب العرض الحالي: <span className="font-black text-gold-300">{actualIndex + 1}</span></p>
                      <p className="mt-1 text-[11px] text-ivory/35">أي تغيير في الترتيب يتسجل كمسودة لحد ما تضغط «حفظ التعديلات».</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <IconBtn title="تقديم الترتيب" onClick={() => moveParticipant(p, -1)} disabled={isFirst}><ArrowUp className="size-3.5" /> <span className="mr-1 text-[10px]">تقديم</span></IconBtn>
                        <IconBtn title="تأخير الترتيب" onClick={() => moveParticipant(p, 1)} disabled={isLast}><ArrowDown className="size-3.5" /> <span className="mr-1 text-[10px]">تأخير</span></IconBtn>
                        <IconBtn title="تغيير صورة الطفولة" onClick={() => { setReplaceTarget({ p, kind: "childhood" }); setReplaceValue(null); }}><ImagePlus className="size-3.5" /></IconBtn>
                        <IconBtn title="تغيير الصورة الحالية" onClick={() => { setReplaceTarget({ p, kind: "adult" }); setReplaceValue(null); }}><RefreshCw className="size-3.5" /></IconBtn>
                        <IconBtn title={p.skipped ? "إلغاء التخطي" : "تخطي من العرض"} onClick={() => draftChange(p.id, "skipped", String(!p.skipped), false)} active={p.skipped}>{p.skipped ? <Undo2 className="size-3.5" /> : <EyeOff className="size-3.5" />}</IconBtn>
                        {p.gradImageStatus === "FAILED" && <IconBtn title="إعادة توليد القبعة" onClick={() => doRetry(p)}><RefreshCw className="size-3.5" /></IconBtn>}
                        <IconBtn title="حذف نهائي" onClick={() => setConfirmDelete(p.id)} danger><Trash2 className="size-3.5" /></IconBtn>
                      </div>
                    </div>
                    <div className="text-[10px] text-ivory/35 md:text-left">{p.submissionType === "GROUP" ? "جروب" : "تقديم فردي"}</div>
                  </div>
                  {busyId === p.id && <div className="mt-3 flex items-center gap-2 text-xs text-gold-300"><Loader2 className="size-4 animate-spin" /> جاري التنفيذ...</div>}
                  {confirmDelete === p.id && <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-4"><p className="text-sm font-black text-red-200">حذف {p.fullName} نهائيًا؟</p><p className="mt-1 text-[11px] text-ivory/50">سيتم حذف سجله وكل صوره (الأصلية والمولّدة)</p><div className="mt-3 flex gap-2"><button onClick={() => doDelete(p)} className="btn-danger rounded-xl px-5 py-2 text-xs font-black">تأكيد الحذف</button><button onClick={() => setConfirmDelete(null)} className="btn-ghost rounded-xl px-5 py-2 text-xs font-black">تراجع</button></div></div>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal open={!!replaceTarget} onClose={() => setReplaceTarget(null)} title={replaceTarget?.kind === "adult" ? `تغيير الصورة الحالية — ${replaceTarget?.p.fullName ?? ""}` : `تغيير صورة الطفولة — ${replaceTarget?.p.fullName ?? ""}`}>
        {replaceTarget && <div className="space-y-4"><UploadField key={`${replaceTarget.p.id}-${replaceTarget.kind}`} kind={replaceTarget.kind} label={replaceTarget.kind === "adult" ? "الصورة الحالية الجديدة" : "صورة الطفولة الجديدة"} oldStyle={replaceTarget.kind === "childhood"} value={replaceValue} onChange={setReplaceValue} /><p className="rounded-xl border border-amber-400/25 bg-amber-500/5 px-4 py-2.5 text-[11px] font-bold text-amber-200">الصورة الجديدة مسجلة كمسودة — هتتطبق وتحذف القديمة بعد الضغط على زرار «حفظ التعديلات»</p><div className="flex gap-2.5"><button onClick={commitReplace} disabled={!replaceValue} className="btn-gold flex-1 rounded-xl py-3 text-sm">تسجيل التغيير كمسودة</button><button onClick={() => setReplaceTarget(null)} className="btn-ghost rounded-xl px-6 py-3 text-sm font-bold">إلغاء</button></div></div>}
      </Modal>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="إضافة خريج من غرفة الإدارة" wide>
        <MemberForm member={addMember} title="بيانات الخريج" subtitle="هيتضاف في آخر قائمة العرض" onChange={setAddMember} />
        <div className="mt-5 flex gap-2.5"><button onClick={submitAdd} disabled={!memberIsValid(addMember) || addBusy} className="btn-gold flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm">{addBusy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} إضافة فورية</button><button onClick={() => setAddOpen(false)} className="btn-ghost rounded-xl px-6 py-3 text-sm font-bold">إلغاء</button></div>
      </Modal>
    </div>
  );
}

function IconBtn({ children, title, onClick, disabled, danger, active }: { children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean; danger?: boolean; active?: boolean; }) {
  return <button type="button" title={title} onClick={(e) => { e.stopPropagation(); onClick(); }} disabled={disabled} className={`inline-flex items-center justify-center gap-1 rounded-xl border px-2.5 py-2 transition-all disabled:opacity-25 ${danger ? "border-red-400/30 text-red-300 hover:bg-red-500/15" : active ? "border-amber-400/50 bg-amber-500/15 text-amber-300" : "border-gold-500/25 text-gold-300 hover:bg-gold-500/10"}`}>{children}</button>;
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return <div className="card-lux rounded-2xl px-5 py-4"><p className="text-[11px] font-bold text-ivory/45">{label}</p><p className={`mt-1 font-display font-bold text-gold-200 ${small ? "text-sm" : "text-2xl"}`}>{value}</p></div>;
}

function ExportLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return <a href={href} className="btn-ghost inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold">{icon} {label}</a>;
}
