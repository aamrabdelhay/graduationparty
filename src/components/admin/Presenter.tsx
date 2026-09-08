"use client";

import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FastForward,
  GraduationCap,
  Link2,
  Loader2,
  MonitorPlay,
  Pause,
  Pencil,
  Play,
  Rewind,
  RotateCcw,
  SkipForward,
  Square,
  Timer,
  Zap,
} from "lucide-react";
import {
  AdminParticipant,
  DisplayTokenRow,
  PresState,
  timeFmt,
} from "./shared";

interface Props {
  pres: PresState | null;
  queue: AdminParticipant[];
  command: (action: string, payload?: Record<string, unknown>) => Promise<void>;
  cmdBusy: boolean;
  tokens: DisplayTokenRow[];
  refreshTokens: () => Promise<void>;
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

export default function Presenter({
  pres,
  queue,
  command,
  cmdBusy,
  tokens,
  refreshTokens,
  draftChange,
  moveParticipant,
  showToast,
}: Props) {
  const [origin, setOrigin] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [timings, setTimings] = useState({
    childhoodDuration: 2800,
    smokeDuration: 2200,
    adultDuration: 2600,
    nameAnimationDuration: 1800,
  });
  const [tokenBusy, setTokenBusy] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (pres) {
      setTimings({
        childhoodDuration: pres.childhoodDuration,
        smokeDuration: pres.smokeDuration,
        adultDuration: pres.adultDuration,
        nameAnimationDuration: pres.nameAnimationDuration,
      });
    }
    // Only sync when a fresh presentation state arrives from the server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pres?.sequenceVersion]);

  const currentIdx = pres?.participant
    ? queue.findIndex((p) => p.id === pres.participant!.id)
    : -1;

  const activeToken = tokens.find((t) => !t.revokedAt);
  const screenUrl = activeToken ? `${origin}/screen?token=${activeToken.token}` : null;

  async function generateToken() {
    setTokenBusy(true);
    const r = await fetch("/api/admin/display-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "شاشة البروجكتور" }),
    });
    const j = await r.json();
    setTokenBusy(false);
    if (j.ok) {
      await refreshTokens();
      showToast("تم توليد رابط عرض جديد");
    }
  }

  async function revokeAll() {
    setTokenBusy(true);
    await fetch("/api/admin/display-tokens", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    setTokenBusy(false);
    await refreshTokens();
    await generateToken();
  }

  async function copyLink() {
    if (!screenUrl) return;
    try {
      await navigator.clipboard.writeText(screenUrl);
      showToast("تم نسخ رابط الشاشة");
    } catch {
      showToast(screenUrl);
    }
  }

  const running = pres?.status === "RUNNING";

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      {/* ------------------------------ Live control ------------------------------ */}
      <section className="space-y-5 lg:col-span-3">
        {/* Now showing */}
        <div className="card-lux lux-frame rounded-3xl p-6 text-center">
          <p className="mb-4 flex items-center justify-center gap-2 text-xs font-black tracking-wide text-gold-300">
            <MonitorPlay className="size-4" />
            على الشاشة الآن
            <StatusPill pres={pres} />
          </p>

          {pres?.participant ? (
            <div className="animate-fade-in">
              <div className="lux-frame lux-corner mx-auto aspect-[4/5] w-full max-w-60 overflow-hidden rounded-2xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pres.participant.graduationImageUrl ?? ""}
                  alt={pres.participant.name}
                  className="h-full w-full object-cover"
                />
              </div>
              <h2 className="mt-5 font-display text-3xl font-bold">
                <span className="gold-text">{pres.participant.name}</span>
              </h2>
              <p className="mt-1 text-[11px] text-ivory/45">
                الترتيب {currentIdx + 1 >= 0 ? currentIdx + 1 : "—"} من {queue.length}
              </p>
            </div>
          ) : (
            <div className="py-10">
              <GraduationCap className="mx-auto mb-4 size-12 text-gold-500/40" />
              <p className="font-display text-2xl font-bold text-ivory/60">
                {pres?.status === "FINISHED"
                  ? "العرض انتهى — مبروك لكل الخريجين"
                  : "العرض لم يبدأ بعد"}
              </p>
              <p className="mt-2 text-xs text-ivory/40">
                {pres?.status === "FINISHED"
                  ? "اضغط «إعادة من الأول» لتشغيل العرض مرة أخرى"
                  : "اضغط «بدء العرض» لتظهر أول لقطة على البروجكتور"}
              </p>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="card-lux rounded-3xl p-5">
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
            <Ctl
              onClick={() => command(pres?.status === "FINISHED" ? "restart" : "start")}
              disabled={cmdBusy || queue.length === 0}
              primary
              icon={<Play className="size-4" />}
              label={running ? "من البداية" : "بدء العرض"}
            />
            <Ctl
              onClick={() => command(running && pres?.isPaused ? "resume" : "pause")}
              disabled={cmdBusy || !running}
              icon={pres?.isPaused ? <Play className="size-4" /> : <Pause className="size-4" />}
              label={pres?.isPaused ? "استكمال" : "إيقاف مؤقت"}
            />
            <Ctl
              onClick={() => command("previous")}
              disabled={cmdBusy || !running}
              icon={<Rewind className="size-4" />}
              label="السابق"
            />
            <Ctl
              onClick={() => command("next")}
              disabled={cmdBusy || pres?.status === "FINISHED"}
              icon={<FastForward className="size-4" />}
              label="التالي"
            />
            <Ctl
              onClick={() => command("skip", {})}
              disabled={cmdBusy || !pres?.participant}
              danger
              icon={<EyeOff className="size-4" />}
              label="تخطي الحالي"
            />
            <Ctl
              onClick={() => command("replay")}
              disabled={cmdBusy || !pres?.participant}
              icon={<RotateCcw className="size-4" />}
              label="إعادة اللقطة"
            />
            <Ctl
              onClick={() => command("restart")}
              disabled={cmdBusy || queue.length === 0}
              icon={<RotateCcw className="size-4" />}
              label="إعادة من الأول"
            />
            <Ctl
              onClick={() => command("stop")}
              disabled={cmdBusy || pres?.status === "IDLE"}
              icon={<Square className="size-4" />}
              label="إنهاء العرض"
            />
          </div>

          <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <span className="flex items-center gap-2 text-xs font-black text-ivory/70">
              <Zap className="size-4 text-gold-400" />
              التشغيل التلقائي (ينتقل للتالي وحده)
            </span>
            <button
              onClick={() =>
                command("mode", {
                  playbackMode: pres?.playbackMode === "auto" ? "manual" : "auto",
                })
              }
              className={`relative h-7 w-13 rounded-full border transition-colors ${
                pres?.playbackMode === "auto"
                  ? "border-gold-400 bg-gold-500/30"
                  : "border-white/15 bg-night-700"
              }`}
            >
              <span
                className={`absolute top-0.5 size-5.5 rounded-full bg-gold-300 transition-all ${
                  pres?.playbackMode === "auto" ? "left-0.5" : "left-6"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Timings */}
        <div className="card-lux rounded-3xl p-5">
          <p className="mb-4 flex items-center gap-2 text-sm font-black text-gold-200">
            <Timer className="size-4" /> توقيتات اللقطة (مللي ثانية)
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <TimingInput
              label="صورة الطفولة"
              value={timings.childhoodDuration}
              onChange={(v) => setTimings({ ...timings, childhoodDuration: v })}
            />
            <TimingInput
              label="الدخان"
              value={timings.smokeDuration}
              onChange={(v) => setTimings({ ...timings, smokeDuration: v })}
            />
            <TimingInput
              label="صورة التخرج"
              value={timings.adultDuration}
              onChange={(v) => setTimings({ ...timings, adultDuration: v })}
            />
            <TimingInput
              label="ظهور الاسم"
              value={timings.nameAnimationDuration}
              onChange={(v) => setTimings({ ...timings, nameAnimationDuration: v })}
            />
          </div>
          <button
            onClick={() => command("timings", { ...timings })}
            disabled={cmdBusy}
            className="btn-gold mt-4 inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-xs"
          >
            <Check className="size-4" /> تطبيق التوقيتات
          </button>
        </div>

        {/* Display token */}
        <div className="card-lux rounded-3xl p-5">
          <p className="mb-1 flex items-center gap-2 text-sm font-black text-gold-200">
            <Link2 className="size-4" /> رابط شاشة البروجكتور
          </p>
          <p className="mb-4 text-[11px] leading-relaxed text-ivory/45">
            الشاشة تشوف اللقطة الحالية فقط (الصورة والاسم) — بدون أي بيانات تانية.
            افتح الرابط ده على جهاز البروجكتور أو الشير سكرين.
          </p>
          {screenUrl ? (
            <div className="flex flex-wrap items-center gap-2">
              <code
                dir="ltr"
                className="max-w-full flex-1 truncate rounded-xl border border-gold-500/25 bg-night-900 px-4 py-2.5 text-left text-[11px] text-gold-200"
              >
                {screenUrl}
              </code>
              <button onClick={copyLink} className="btn-ghost inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold">
                <Copy className="size-3.5" /> نسخ
              </button>
              <a
                href={screenUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-gold inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs"
              >
                <ExternalLink className="size-3.5" /> فتح الشاشة
              </a>
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={generateToken}
              disabled={tokenBusy}
              className="btn-ghost inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold"
            >
              {tokenBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}
              {activeToken ? "توليد رابط إضافي" : "توليد رابط العرض"}
            </button>
            {activeToken && (
              <button
                onClick={revokeAll}
                disabled={tokenBusy}
                className="btn-danger inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold"
              >
                <Square className="size-3.5" /> إبطال كل الروابط وتوليد جديد
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ------------------------------ Behind the show ------------------------------ */}
      <section className="lg:col-span-2">
        <div className="card-lux rounded-3xl p-5 lg:sticky lg:top-24">
          <p className="mb-1 flex items-center gap-2 text-sm font-black text-gold-200">
            <Eye className="size-4" /> ورا السلايد شو — مين الجاي؟
          </p>
          <p className="mb-4 text-[11px] leading-relaxed text-ivory/45">
            القايمة دي ليك أنت بس — عدّل أو اقفز أو تخطَّ في أي وقت، ومش هيظهر
            حاجة منها على البروجكتور غير صورة الخريج واسمه.
          </p>

          {queue.length === 0 ? (
            <p className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-xs text-ivory/40">
              لا يوجد خريجين في قائمة العرض
            </p>
          ) : (
            <div className="max-h-[62dvh] space-y-2 overflow-y-auto pl-1">
              {queue.map((p, i) => {
                const isCurrent = pres?.participant?.id === p.id;
                const isPast = currentIdx !== -1 && i < currentIdx;
                return (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 rounded-2xl border p-3 transition-all ${
                      isCurrent
                        ? "border-gold-400 bg-gold-500/12 shadow-[0_0_30px_-10px_rgba(212,175,55,0.5)]"
                        : isPast
                          ? "border-white/5 opacity-45"
                          : "border-white/10 bg-white/[0.03] hover:border-gold-500/35"
                    }`}
                  >
                    <button
                      onClick={() => command("jump", { participantId: p.id })}
                      disabled={cmdBusy}
                      title="عرض هذا الآن"
                      className={`flex size-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-black transition-colors ${
                        isCurrent
                          ? "border-gold-400 bg-gold-500 text-night-950"
                          : "border-gold-500/30 text-gold-300 hover:bg-gold-500/15"
                      }`}
                    >
                      {i + 1}
                    </button>

                    <div className="min-w-0 flex-1">
                      {editingId === p.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            autoFocus
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const v = editingName.trim();
                                if (v && v !== p.fullName)
                                  draftChange(p.id, "fullName", v, false);
                                setEditingId(null);
                              }
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="input-lux w-full rounded-lg px-2 py-1.5 text-xs font-bold"
                          />
                          <button
                            onClick={() => {
                              const v = editingName.trim();
                              if (v && v !== p.fullName)
                                draftChange(p.id, "fullName", v, false);
                              setEditingId(null);
                            }}
                            className="rounded-lg bg-gold-500/20 p-1.5 text-gold-300"
                          >
                            <Check className="size-3.5" />
                          </button>
                        </div>
                      ) : (
                        <p className="truncate text-sm font-black text-ivory">
                          {p.fullName}
                        </p>
                      )}
                      <p className="text-[10px] text-ivory/40">
                        {isCurrent
                          ? "معروض الآن على الشاشة"
                          : isPast
                            ? "اتعرض"
                            : `قدّم ${timeFmt.format(new Date(p.submittedAt))}`}
                      </p>
                    </div>

                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.graduationImageUrl ?? p.adultImageUrl ?? ""}
                      alt=""
                      className="size-10 shrink-0 rounded-xl border border-gold-500/25 object-cover"
                    />

                    <div className="flex shrink-0 flex-col gap-1">
                      <QueueBtn title="تعديل الاسم" onClick={() => { setEditingId(p.id); setEditingName(p.fullName); }}>
                        <Pencil className="size-3" />
                      </QueueBtn>
                      <QueueBtn
                        title="تخطي فورًا"
                        onClick={() => command("skip", { participantId: p.id })}
                      >
                        <SkipForward className="size-3" />
                      </QueueBtn>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <QueueBtn title="تقديم" onClick={() => moveParticipant(p, -1)} disabled={i === 0}>
                        <ArrowUp className="size-3" />
                      </QueueBtn>
                      <QueueBtn
                        title="تأخير"
                        onClick={() => moveParticipant(p, 1)}
                        disabled={i === queue.length - 1}
                      >
                        <ArrowDown className="size-3" />
                      </QueueBtn>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Ctl({
  onClick,
  disabled,
  icon,
  label,
  primary,
  danger,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border py-3.5 text-[11px] font-black transition-all disabled:opacity-35 ${
        primary
          ? "border-gold-400 bg-gold-500/20 text-gold-200 hover:bg-gold-500/30"
          : danger
            ? "border-red-400/30 text-red-300 hover:bg-red-500/10"
            : "border-white/10 text-ivory/70 hover:border-gold-500/40 hover:text-gold-200"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function QueueBtn({
  children,
  title,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center rounded-lg border border-white/10 p-1.5 text-ivory/50 transition-colors hover:border-gold-500/40 hover:text-gold-300 disabled:opacity-25"
    >
      {children}
    </button>
  );
}

function TimingInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-bold text-ivory/50">{label}</span>
      <input
        type="number"
        min={300}
        max={60000}
        step={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="input-lux w-full rounded-xl px-3 py-2.5 text-center text-sm font-black"
        dir="ltr"
      />
    </label>
  );
}

function StatusPill({ pres }: { pres: PresState | null }) {
  if (!pres) return null;
  if (pres.status === "RUNNING" && pres.isPaused)
    return (
      <span className="rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1 text-[10px] text-amber-300">
        إيقاف مؤقت
      </span>
    );
  if (pres.status === "RUNNING")
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-[10px] text-emerald-300">
        <span className="size-1.5 animate-pulse rounded-full bg-emerald-300" />
        لايف
      </span>
    );
  if (pres.status === "FINISHED")
    return (
      <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] text-ivory/60">
        انتهى
      </span>
    );
  return (
    <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] text-ivory/50">
      لم يبدأ
    </span>
  );
}
