"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Download,
  EyeOff,
  FileSpreadsheet,
  FileText,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
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

type Cluster = { key: string; members: AdminParticipant[] };

export default function Roster({
  groups,
  participants,
  drafts,
  draftChange,
  moveParticipant,
  refreshParticipants,
  showToast,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<{
    p: AdminParticipant;
    kind: "childhood" | "adult";
  } | null>(null);
  const [replaceValue, setReplaceValue] = useState<any>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addMember, setAddMember] = useState<MemberData>(emptyMember("admin-add"));
  const [addBusy, setAddBusy] = useState(false);

  /* Cluster consecutive members of the same group for the cards view */
  const clusters = useMemo<Cluster[]>(() => {
    const out: Cluster[] = [];
    for (const p of participants) {
      if (p.groupId) {
        const last = out[out.length - 1];
        if (last && last.key === `g-${p.groupId}`) last.members.push(p);
        else out.push({ key: `g-${p.groupId}`, members: [p] });
      } else {
        out.push({ key: `s-${p.id}`, members: [p] });
      }
    }
    return out;
  }, [participants]);

  const hasDraft = (id: string) => drafts.some((d) => d.participantId === id);

  async function doDelete(p: AdminParticipant) {
    setBusyId(p.id);
    const r = await fetch(`/api/admin/participants/${p.id}`, { method: "DELETE" });
    const j = await r.json();
    setBusyId(null);
    setConfirmDelete(null);
    if (j.ok) {
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
    const field =
      replaceTarget.kind === "adult" ? "adultImageUrl" : "childhoodImageUrl";
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
      body: JSON.stringify({
        fullName: memberFullName(addMember),
        childhoodUrl: addMember.childhood!.originalUrl,
        adultUrl: addMember.adult!.originalUrl,
      }),
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

  const lastSubmission = participants.length
    ? dateTimeFmt.format(
        new Date(
          participants[participants.length - 1].submittedAt,
        ),
      )
    : "—";

  return (
    <div className="space-y-8">
      {/* Stats + exports */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="إجمالي المقدمين" value={String(participants.length)} />
        <Stat label="جروبات" value={String(groups.length)} />
        <Stat label="متخطَّين من العرض" value={String(participants.filter((p) => p.skipped).length)} />
        <Stat label="آخر تقديم" value={lastSubmission} small />
      </section>

      <section className="card-lux flex flex-wrap items-center gap-3 rounded-2xl p-4">
        <p className="flex items-center gap-2 text-sm font-black text-gold-200">
          <Download className="size-4" /> تحميل الكشوفات
        </p>
        <span className="mx-auto" />
        <ExportLink href="/api/admin/export?kind=names&format=csv" label="أسامي فقط CSV" icon={<FileText className="size-4" />} />
        <ExportLink href="/api/admin/export?kind=names&format=xlsx" label="أسامي فقط XLSX" icon={<FileSpreadsheet className="size-4" />} />
        <ExportLink href="/api/admin/export?kind=backup&format=csv" label="نسخة كاملة CSV" icon={<FileText className="size-4" />} />
        <ExportLink href="/api/admin/export?kind=backup&format=xlsx" label="نسخة كاملة XLSX" icon={<FileSpreadsheet className="size-4" />} />
        <button
          onClick={() => setAddOpen(true)}
          className="btn-gold inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs"
        >
          <UserPlus className="size-4" /> إضافة خريج من الإدارة
        </button>
      </section>

      {/* Cards grouped */}
      {participants.length === 0 ? (
        <div className="card-lux rounded-3xl p-14 text-center">
          <UsersRound className="mx-auto mb-4 size-10 text-gold-500/50" />
          <p className="font-display text-2xl font-bold text-ivory/70">
            لا توجد تقديمات بعد
          </p>
          <p className="mt-2 text-xs text-ivory/40">
            أول ما حد يسجل من الصفحة الرئيسية هيظهر هنا بصورته ووقت تقديمه
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {clusters.map((c) => {
            const isGroup = c.key.startsWith("g-");
            return (
              <section
                key={c.key}
                className={`rounded-3xl ${isGroup ? "border border-gold-500/25 bg-gold-500/[0.04] p-4" : ""}`}
              >
                {isGroup && (
                  <p className="mb-4 flex items-center gap-2 px-1 text-xs font-black text-gold-300">
                    <UsersRound className="size-4" />
                    جروب — {c.members.length} أعضاء قدّموا مع بعض
                  </p>
                )}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {c.members.map((p) => (
                    <ParticipantCard
                      key={p.id}
                      p={p}
                      index={participants.findIndex((x) => x.id === p.id)}
                      hasDraft={hasDraft(p.id)}
                      busy={busyId === p.id}
                      editing={editingId === p.id}
                      editingName={editingName}
                      setEditing={(v) => {
                        setEditingId(v ? p.id : null);
                        setEditingName(v ? p.fullName : "");
                      }}
                      setEditingName={setEditingName}
                      commitName={() => {
                        const name = editingName.trim();
                        if (name && name !== p.fullName)
                          draftChange(p.id, "fullName", name, false);
                        setEditingId(null);
                      }}
                      onMove={(dir) => moveParticipant(p, dir)}
                      onToggleSkip={() =>
                        draftChange(p.id, "skipped", String(!p.skipped), false)
                      }
                      onReplace={(kind) => {
                        setReplaceTarget({ p, kind });
                        setReplaceValue(null);
                      }}
                      onRetry={() => doRetry(p)}
                      onDelete={() => setConfirmDelete(p.id)}
                      confirmDelete={confirmDelete === p.id}
                      cancelDelete={() => setConfirmDelete(null)}
                      doDelete={() => doDelete(p)}
                      isFirst={participants.findIndex((x) => x.id === p.id) === 0}
                      isLast={
                        participants.findIndex((x) => x.id === p.id) ===
                        participants.length - 1
                      }
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ------------------------------ Replace modal ------------------------------ */}
      <Modal
        open={!!replaceTarget}
        onClose={() => setReplaceTarget(null)}
        title={
          replaceTarget?.kind === "adult"
            ? `تغيير الصورة الحالية — ${replaceTarget?.p.fullName ?? ""}`
            : `تغيير صورة الطفولة — ${replaceTarget?.p.fullName ?? ""}`
        }
      >
        {replaceTarget && (
          <div className="space-y-4">
            <UploadField
              key={`${replaceTarget.p.id}-${replaceTarget.kind}`}
              kind={replaceTarget.kind}
              label={
                replaceTarget.kind === "adult" ? "الصورة الحالية الجديدة" : "صورة الطفولة الجديدة"
              }
              oldStyle={replaceTarget.kind === "childhood"}
              value={replaceValue}
              onChange={setReplaceValue}
            />
            <p className="rounded-xl border border-amber-400/25 bg-amber-500/5 px-4 py-2.5 text-[11px] font-bold text-amber-200">
              الصورة الجديدة مسجلة كمسودة — هتتطبق وتحذف القديمة بعد الضغط على
              زرار «حفظ التعديلات»
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={commitReplace}
                disabled={!replaceValue}
                className="btn-gold flex-1 rounded-xl py-3 text-sm"
              >
                تسجيل التغيير كمسودة
              </button>
              <button
                onClick={() => setReplaceTarget(null)}
                className="btn-ghost rounded-xl px-6 py-3 text-sm font-bold"
              >
                إلغاء
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ------------------------------ Add participant ------------------------------ */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="إضافة خريج من غرفة الإدارة" wide>
        <MemberForm
          member={addMember}
          title="بيانات الخريج"
          subtitle="هيتضاف في آخر قائمة العرض"
          onChange={setAddMember}
        />
        <div className="mt-5 flex gap-2.5">
          <button
            onClick={submitAdd}
            disabled={!memberIsValid(addMember) || addBusy}
            className="btn-gold flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm"
          >
            {addBusy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            إضافة فورية
          </button>
          <button onClick={() => setAddOpen(false)} className="btn-ghost rounded-xl px-6 py-3 text-sm font-bold">
            إلغاء
          </button>
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------- Card ------------------------------- */

function ParticipantCard({
  p,
  index,
  hasDraft,
  busy,
  editing,
  editingName,
  setEditing,
  setEditingName,
  commitName,
  onMove,
  onToggleSkip,
  onReplace,
  onRetry,
  onDelete,
  confirmDelete,
  cancelDelete,
  doDelete,
  isFirst,
  isLast,
}: {
  p: AdminParticipant;
  index: number;
  hasDraft: boolean;
  busy: boolean;
  editing: boolean;
  editingName: string;
  setEditing: (v: boolean) => void;
  setEditingName: (v: string) => void;
  commitName: () => void;
  onMove: (dir: -1 | 1) => void;
  onToggleSkip: () => void;
  onReplace: (kind: "childhood" | "adult") => void;
  onRetry: () => void;
  onDelete: () => void;
  confirmDelete: boolean;
  cancelDelete: () => void;
  doDelete: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const chip = statusChip(p.gradImageStatus);
  return (
    <article
      className={`card-lux relative animate-fade-up rounded-3xl p-4 transition-all ${
        p.skipped ? "opacity-55" : ""
      }`}
    >
      {busy && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-3xl bg-night-950/70">
          <Loader2 className="size-7 animate-spin text-gold-400" />
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-500/30 bg-gold-500/10 px-2.5 py-1 text-[10px] font-black text-gold-300">
          #{index + 1}
        </span>
        <div className="flex items-center gap-1.5">
          {hasDraft && (
            <span className="rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[9px] font-black text-amber-300">
              مسودة
            </span>
          )}
          {p.submissionType === "GROUP" && (
            <span className="rounded-full border border-purple-400/30 bg-purple-500/10 px-2 py-0.5 text-[9px] font-black text-purple-300">
              جروب
            </span>
          )}
        </div>
      </div>

      <div className="lux-frame mx-auto mb-4 aspect-[4/5] w-full max-w-56 overflow-hidden rounded-2xl">
        {p.graduationImageUrl || p.adultImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.graduationImageUrl ?? p.adultImageUrl ?? ""}
            alt={p.fullName}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="skel h-full w-full" />
        )}
      </div>

      {editing ? (
        <div className="mb-2 flex items-center gap-2">
          <input
            autoFocus
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commitName()}
            className="input-lux w-full rounded-xl px-3 py-2 text-sm font-bold"
          />
          <button onClick={commitName} className="rounded-xl bg-gold-500/20 p-2 text-gold-300">
            <Check className="size-4" />
          </button>
        </div>
      ) : (
        <h3 className="mb-1 flex items-center justify-center gap-2 text-center font-display text-lg leading-snug font-bold text-ivory">
          {p.fullName}
          <button
            onClick={() => setEditing(true)}
            className="text-ivory/35 transition-colors hover:text-gold-300"
            aria-label="تعديل الاسم"
          >
            <Pencil className="size-3.5" />
          </button>
        </h3>
      )}

      <p className="mb-3 text-center text-[11px] text-ivory/45">
        قدّم الساعة {timeFmt.format(new Date(p.submittedAt))}
      </p>

      <div className="mb-3 flex items-center justify-center">
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${chip.cls}`}>
          {chip.label}
        </span>
      </div>

      <div className="grid grid-cols-6 gap-1.5">
        <IconBtn title="تقديم الترتيب" onClick={() => onMove(-1)} disabled={isFirst}>
          <ArrowUp className="size-3.5" />
        </IconBtn>
        <IconBtn title="تأخير الترتيب" onClick={() => onMove(1)} disabled={isLast}>
          <ArrowDown className="size-3.5" />
        </IconBtn>
        <IconBtn
          title="تغيير صورة الطفولة"
          onClick={() => onReplace("childhood")}
        >
          <ImagePlus className="size-3.5" />
        </IconBtn>
        <IconBtn title="تغيير الصورة الحالية" onClick={() => onReplace("adult")}>
          <RefreshCw className="size-3.5" />
        </IconBtn>
        <IconBtn
          title={p.skipped ? "إلغاء التخطي" : "تخطي من العرض"}
          onClick={onToggleSkip}
          active={p.skipped}
        >
          {p.skipped ? <Undo2 className="size-3.5" /> : <EyeOff className="size-3.5" />}
        </IconBtn>
        <IconBtn title="حذف نهائي" onClick={onDelete} danger>
          <Trash2 className="size-3.5" />
        </IconBtn>
      </div>

      {p.gradImageStatus === "FAILED" && (
        <button
          onClick={onRetry}
          className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl border border-red-400/35 bg-red-500/10 py-2 text-[11px] font-black text-red-200 hover:bg-red-500/20"
        >
          <RefreshCw className="size-3.5" /> إعادة توليد القبعة (AI)
        </button>
      )}

      {confirmDelete && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 rounded-3xl bg-night-950/95 p-4 text-center">
          <p className="text-sm font-black text-red-200">
            حذف {p.fullName} نهائيًا؟
          </p>
          <p className="text-[11px] text-ivory/50">
            سيتم حذف سجله وكل صوره (الأصلية والمولّدة)
          </p>
          <div className="flex gap-2">
            <button onClick={doDelete} className="btn-danger rounded-xl px-5 py-2 text-xs font-black">
              تأكيد الحذف
            </button>
            <button onClick={cancelDelete} className="btn-ghost rounded-xl px-5 py-2 text-xs font-black">
              تراجع
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  disabled,
  danger,
  active,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center rounded-xl border py-2 transition-all disabled:opacity-25 ${
        danger
          ? "border-red-400/30 text-red-300 hover:bg-red-500/15"
          : active
            ? "border-amber-400/50 bg-amber-500/15 text-amber-300"
            : "border-gold-500/25 text-gold-300 hover:bg-gold-500/10"
      }`}
    >
      {children}
    </button>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="card-lux rounded-2xl px-5 py-4">
      <p className="text-[11px] font-bold text-ivory/45">{label}</p>
      <p className={`mt-1 font-display font-bold text-gold-200 ${small ? "text-sm" : "text-2xl"}`}>
        {value}
      </p>
    </div>
  );
}

function ExportLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="btn-ghost inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold"
    >
      {icon} {label}
    </a>
  );
}
