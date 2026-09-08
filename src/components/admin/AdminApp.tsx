"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  DoorOpen,
  GraduationCap,
  Loader2,
  MonitorPlay,
  Save,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import Roster from "./Roster";
import Presenter from "./Presenter";
import {
  AdminGroup,
  AdminParticipant,
  ConflictItem,
  DisplayTokenRow,
  DraftItem,
  FIELD_LABELS,
  Modal,
  PresState,
  Thumb,
  dateTimeFmt,
} from "./shared";

export default function AdminApp() {
  const router = useRouter();
  const [tab, setTab] = useState<"roster" | "presenter">("roster");
  const [participants, setParticipants] = useState<AdminParticipant[]>([]);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [discarded, setDiscarded] = useState<DraftItem[]>([]);
  const [tokens, setTokens] = useState<DisplayTokenRow[]>([]);
  const [pres, setPres] = useState<PresState | null>(null);
  const [conflicts, setConflicts] = useState<ConflictItem[] | null>(null);
  const conflictChoices = useRef<Record<string, "mine" | "db">>({});
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cmdBusy, setCmdBusy] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3600);
  }, []);

  const refreshParticipants = useCallback(async () => {
    const r = await fetch("/api/admin/participants");
    const j = await r.json();
    if (j.ok) {
      setParticipants(j.participants);
      setGroups(j.groups);
    }
  }, []);

  const refreshMe = useCallback(async () => {
    const r = await fetch("/api/admin/me");
    const j = await r.json();
    if (j.ok) {
      setDrafts(j.openDrafts);
      setDiscarded(j.discarded);
    }
  }, []);

  const refreshTokens = useCallback(async () => {
    const r = await fetch("/api/admin/display-tokens");
    const j = await r.json();
    if (j.ok) setTokens(j.tokens);
  }, []);

  const refreshPres = useCallback(async () => {
    const r = await fetch("/api/admin/presentation");
    const j = await r.json();
    if (j.ok) setPres(j.state);
  }, []);

  useEffect(() => {
    refreshParticipants();
    refreshMe();
    refreshTokens();
    refreshPres();
    const poll = setInterval(refreshPres, 12000);
    return () => clearInterval(poll);
  }, [refreshParticipants, refreshMe, refreshTokens, refreshPres]);

  /* Live sync with the projector via the active display token */
  const activeToken = tokens.find((t) => !t.revokedAt)?.token ?? null;
  useEffect(() => {
    if (!activeToken) return;
    const es = new EventSource(`/api/presentation/stream?token=${activeToken}`);
    es.onmessage = (e) => {
      try {
        setPres(JSON.parse(e.data));
      } catch {
        /* noop */
      }
    };
    return () => es.close();
  }, [activeToken]);

  /* ------------------------- Effective (merged) data ------------------------- */

  const effective = useMemo(() => {
    const merged = participants.map((p) => {
      const v = { ...p };
      for (const d of drafts.filter((x) => x.participantId === p.id)) {
        if (d.field === "fullName") v.fullName = d.newValue ?? v.fullName;
        if (d.field === "skipped") v.skipped = d.newValue === "true";
        if (d.field === "displayOrder")
          v.displayOrder = Number(d.newValue ?? v.displayOrder);
        if (d.field === "childhoodImageUrl")
          v.childhoodImageUrl = d.newValue ?? v.childhoodImageUrl;
        if (d.field === "adultImageUrl")
          v.adultImageUrl = d.newValue ?? v.adultImageUrl;
      }
      return v;
    });
    return merged.sort(
      (a, b) =>
        a.displayOrder - b.displayOrder ||
        new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
    );
  }, [participants, drafts]);

  const queue = useMemo(() => effective.filter((p) => !p.skipped), [effective]);

  /* ------------------------------- Mutations ------------------------------- */

  async function draftChange(
    participantId: string,
    field: string,
    newValue: string | null,
    quiet = true,
  ) {
    const r = await fetch("/api/admin/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId, field, newValue }),
    });
    const j = await r.json();
    if (!j.ok) showToast(j.error || "تعذر حفظ المسودة");
    else if (!quiet) showToast("تم تسجيل التعديل — لا تنسَ الضغط على حفظ");
    await refreshMe();
  }

  async function moveParticipant(p: AdminParticipant, dir: -1 | 1) {
    const idx = effective.findIndex((x) => x.id === p.id);
    const other = effective[idx + dir];
    if (!other) return;
    await draftChange(p.id, "displayOrder", String(other.displayOrder));
    await draftChange(other.id, "displayOrder", String(p.displayOrder));
  }

  async function saveAll(forceIds: string[] = []) {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/drafts/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceParticipantIds: forceIds }),
      });
      const j = await r.json();
      if (r.status === 409) {
        conflictChoices.current = Object.fromEntries(
          (j.conflicts as ConflictItem[]).map((c) => [c.draftId, "db"]),
        );
        setConflicts(j.conflicts);
      } else if (j.ok) {
        setConflicts(null);
        showToast(
          j.applied > 0 ? `تم حفظ ${j.applied} تعديل بنجاح` : "لا توجد تعديلات للحفظ",
        );
        await Promise.all([refreshParticipants(), refreshMe(), refreshPres()]);
      } else {
        showToast(j.error || "تعذر الحفظ");
      }
    } finally {
      setSaving(false);
    }
  }

  async function resolveConflicts() {
    const choices = conflictChoices.current;
    const forceIds: string[] = [];
    const deleteIds: string[] = [];
    for (const c of conflicts ?? []) {
      if (choices[c.draftId] === "mine") forceIds.push(c.participantId);
      else deleteIds.push(c.draftId);
    }
    for (const id of deleteIds) {
      await fetch("/api/admin/drafts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: id }),
      });
    }
    setConflicts(null);
    await refreshMe();
    await saveAll(forceIds);
  }

  async function command(action: string, payload: Record<string, unknown> = {}) {
    setCmdBusy(true);
    try {
      const r = await fetch("/api/admin/presentation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const j = await r.json();
      if (j.ok) {
        setPres(j.state);
        if (action === "skip") await refreshParticipants();
      } else {
        showToast(j.error || "تعذر تنفيذ الأمر");
      }
    } finally {
      setCmdBusy(false);
    }
  }

  /* Auto-advance for the automatic playback mode */
  useEffect(() => {
    if (!pres) return;
    if (
      pres.status !== "RUNNING" ||
      pres.isPaused ||
      pres.playbackMode !== "auto" ||
      !pres.participant
    )
      return;
    const total =
      pres.childhoodDuration +
      pres.smokeDuration +
      pres.adultDuration +
      pres.nameAnimationDuration +
      900;
    const started = pres.phaseStartedAt
      ? new Date(pres.phaseStartedAt).getTime()
      : Date.now();
    const remaining = total - (Date.now() - started);
    const t = setTimeout(() => command("next"), Math.max(600, remaining));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pres?.sequenceVersion,
    pres?.playbackMode,
    pres?.status,
    pres?.isPaused,
    pres?.participant?.id,
  ]);

  async function doLogout(saveFirst: boolean) {
    setLogoutOpen(false);
    if (saveFirst) await saveAll();
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  async function ackDiscarded() {
    await fetch("/api/admin/drafts/discarded", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ack" }),
    });
    setReviewOpen(false);
    await refreshMe();
  }

  async function restoreDiscarded(ids: string[]) {
    const r = await fetch("/api/admin/drafts/discarded", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore", ids }),
    });
    const j = await r.json();
    showToast(`تم استرجاع ${j.restored ?? 0} تعديل كمسودة — راجعها واضغط حفظ`);
    setReviewOpen(false);
    await refreshMe();
  }

  /* --------------------------------- Render --------------------------------- */

  return (
    <main className="min-h-dvh pb-16">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-gold-500/15 bg-night-950/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="rounded-xl border border-gold-500/40 bg-gold-500/10 p-2">
              <GraduationCap className="size-5 text-gold-400" />
            </span>
            <div>
              <p className="font-display text-base leading-none font-bold gold-text">
                غرفة الإدارة
              </p>
              <p className="mt-0.5 text-[10px] text-ivory/40">تحكم كامل في الحفل</p>
            </div>
          </div>

          <nav className="mx-auto flex items-center gap-1.5 rounded-2xl border border-white/10 bg-white/5 p-1">
            <TabBtn
              active={tab === "roster"}
              onClick={() => setTab("roster")}
              icon={<ClipboardList className="size-4" />}
              label="كشف الخريجين"
            />
            <TabBtn
              active={tab === "presenter"}
              onClick={() => setTab("presenter")}
              icon={<MonitorPlay className="size-4" />}
              label="غرفة السلايد شو"
            />
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={() => saveAll()}
              disabled={saving || drafts.length === 0}
              className="btn-gold relative inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              حفظ التعديلات
              {drafts.length > 0 && (
                <span className="absolute -top-2 -left-2 flex size-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white">
                  {drafts.length}
                </span>
              )}
            </button>
            <button
              onClick={() =>
                drafts.length > 0 ? setLogoutOpen(true) : doLogout(false)
              }
              className="btn-ghost inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold"
            >
              <DoorOpen className="size-4" /> تسجيل الخروج
            </button>
          </div>
        </div>
      </header>

      {/* Unsaved-changes reminder from previous session */}
      {discarded.length > 0 && (
        <div className="mx-auto mt-5 max-w-7xl px-4">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-400/35 bg-amber-500/10 px-5 py-3.5 animate-fade-in">
            <TriangleAlert className="size-5 shrink-0 text-amber-300" />
            <p className="text-sm font-bold text-amber-200">
              كان عندك {discarded.length} تعديل لم يتم حفظه في جلستك السابقة قبل
              تسجيل الخروج.
            </p>
            <span className="mx-auto" />
            <button
              onClick={() => setReviewOpen(true)}
              className="btn-ghost inline-flex items-center gap-2 rounded-xl border-amber-400/40 px-4 py-2 text-xs font-bold text-amber-200"
            >
              <Undo2 className="size-3.5" /> مراجعة التعديلات
            </button>
            <button
              onClick={ackDiscarded}
              className="text-xs font-bold text-ivory/50 underline underline-offset-4 hover:text-ivory"
            >
              تجاهل
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="mx-auto mt-6 max-w-7xl px-4">
        {tab === "roster" ? (
          <Roster
            groups={groups}
            participants={effective}
            drafts={drafts}
            draftChange={draftChange}
            moveParticipant={moveParticipant}
            refreshParticipants={refreshParticipants}
            showToast={showToast}
          />
        ) : (
          <Presenter
            pres={pres}
            queue={queue}
            command={command}
            cmdBusy={cmdBusy}
            tokens={tokens}
            refreshTokens={refreshTokens}
            draftChange={draftChange}
            moveParticipant={moveParticipant}
            refreshParticipants={refreshParticipants}
            showToast={showToast}
          />
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-fade-up rounded-2xl border border-gold-500/40 bg-night-800/95 px-6 py-3 text-sm font-bold text-gold-200 shadow-2xl backdrop-blur">
          {toast}
        </div>
      )}

      {/* Logout confirmation */}
      <Modal
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        title="عندك تعديلات لم تُحفظ"
      >
        <p className="mb-6 text-sm leading-relaxed text-ivory/60">
          لو سجلت خروج دلوقتي، التعديلات دي (<b className="text-gold-300">{drafts.length}</b>)
          هتتجاهل، وهنفكّرك بيها أول ما ترجع تسجل دخول تاني.
        </p>
        <div className="flex flex-col gap-2.5">
          <button
            onClick={() => doLogout(true)}
            className="btn-gold flex items-center justify-center gap-2 rounded-xl py-3 text-sm"
          >
            <Save className="size-4" /> حفظ التعديلات ثم الخروج
          </button>
          <button
            onClick={() => doLogout(false)}
            className="btn-danger flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold"
          >
            <DoorOpen className="size-4" /> خروج بدون حفظ (سيتم تذكيري لاحقًا)
          </button>
          <button
            onClick={() => setLogoutOpen(false)}
            className="btn-ghost rounded-xl py-3 text-sm font-bold"
          >
            إلغاء
          </button>
        </div>
      </Modal>

      {/* Conflict resolution */}
      <Modal
        open={!!conflicts}
        onClose={() => setConflicts(null)}
        title="تعارض في التعديلات — اتعدل من مكان تاني"
        wide
      >
        <p className="mb-5 text-xs leading-relaxed text-ivory/55">
          السجلات التالية اتعدلت من جلسة/تبويب آخر بعد ما بدأت تعديلك. اختار لكل
          تعديل: الاحتفاظ بالنسخة الحالية من قاعدة البيانات أو تطبيق تعديلك.
        </p>
        <div className="space-y-4">
          {(conflicts ?? []).map((c) => (
            <div
              key={c.draftId}
              className="rounded-2xl border border-red-400/25 bg-red-500/5 p-4"
            >
              <p className="mb-3 text-sm font-black text-red-200">
                {c.participantName} — {FIELD_LABELS[c.field] ?? c.field}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(
                  [
                    ["db", "الموجود حاليًا في قاعدة البيانات", c.dbValue],
                    ["mine", "التعديل بتاعك", c.yourValue],
                  ] as const
                ).map(([key, label, value]) => (
                  <label
                    key={key}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                      conflictChoices.current[c.draftId] === key
                        ? "border-gold-400 bg-gold-500/10"
                        : "border-white/10 hover:border-white/25"
                    }`}
                  >
                    <input
                      type="radio"
                      name={c.draftId}
                      checked={conflictChoices.current[c.draftId] === key}
                      onChange={() => {
                        conflictChoices.current = {
                          ...conflictChoices.current,
                          [c.draftId]: key,
                        };
                        setConflicts([...(conflicts ?? [])]);
                      }}
                      className="mt-1 accent-gold-400"
                    />
                    <span>
                      <span className="block text-[11px] font-bold text-ivory/55">
                        {label}
                      </span>
                      {String(c.field).includes("Image") ? (
                        <Thumb url={value} alt={label} />
                      ) : (
                        <span className="mt-1 block text-sm font-black text-ivory">
                          {value ?? "—"}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex gap-2.5">
          <button
            onClick={resolveConflicts}
            className="btn-gold flex-1 rounded-xl py-3 text-sm"
          >
            تطبيق الاختيارات
          </button>
          <button
            onClick={() => setConflicts(null)}
            className="btn-ghost rounded-xl px-6 py-3 text-sm font-bold"
          >
            لاحقًا
          </button>
        </div>
      </Modal>

      {/* Review discarded drafts */}
      <Modal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="تعديلات لم تُحفظ من جلستك السابقة"
        wide
      >
        <div className="space-y-3">
          {discarded.map((d) => (
            <div
              key={d.id}
              className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4"
            >
              <div className="min-w-40">
                <p className="text-sm font-black text-gold-200">
                  {d.participantName ?? "مشارك محذوف"}
                </p>
                <p className="text-[11px] text-ivory/45">
                  {FIELD_LABELS[d.field] ?? d.field} —{" "}
                  {dateTimeFmt.format(new Date(d.updatedAt))}
                </p>
              </div>
              {String(d.field).includes("Image") ? (
                <div className="flex items-center gap-2">
                  <Thumb url={d.previousValue} alt="قبل" />
                  <span className="text-gold-400">←</span>
                  <Thumb url={d.newValue} alt="بعد" />
                </div>
              ) : (
                <p className="text-sm">
                  <span className="text-ivory/45 line-through">
                    {d.previousValue ?? "—"}
                  </span>{" "}
                  ←{" "}
                  <span className="font-black text-gold-200">
                    {d.newValue ?? "—"}
                  </span>
                </p>
              )}
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-2.5">
          <button
            onClick={() => restoreDiscarded(discarded.map((d) => d.id))}
            className="btn-gold rounded-xl px-6 py-3 text-sm"
          >
            استرجاعها كمسودات الآن
          </button>
          <button
            onClick={ackDiscarded}
            className="btn-danger rounded-xl px-6 py-3 text-sm font-bold"
          >
            تجاهلها نهائيًا
          </button>
        </div>
      </Modal>
    </main>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black transition-all ${
        active
          ? "bg-gold-500/20 text-gold-200 shadow-[inset_0_0_0_1px_rgba(212,175,55,0.4)]"
          : "text-ivory/45 hover:text-ivory"
      }`}
    >
      {icon} {label}
    </button>
  );
}
