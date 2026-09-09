"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  GraduationCap,
  LockKeyhole,
  PartyPopper,
  Plus,
  RotateCcw,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react";
import MemberForm, {
  emptyMember,
  MemberData,
  memberFullName,
  memberIsValid,
} from "@/components/submit/MemberForm";

type Step = "mode" | "form" | "review" | "done";
type Mode = "SOLO" | "GROUP";

const timeFmt = new Intl.DateTimeFormat("ar-EG", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

function Dust() {
  const particles = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        id: i,
        left: `${(i * 47) % 100}%`,
        size: 3 + ((i * 13) % 5),
        delay: `${(i * 1.37) % 9}s`,
        duration: `${9 + ((i * 7) % 9)}s`,
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map((p) => (
        <span
          key={p.id}
          className="dust"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            animationDelay: p.delay,
            animationDuration: p.duration,
            bottom: "-10vh",
          }}
        />
      ))}
    </div>
  );
}

export default function HomePage() {
  const [step, setStep] = useState<Step>("mode");
  const [mode, setMode] = useState<Mode>("SOLO");
  const [members, setMembers] = useState<MemberData[]>(() => [emptyMember("you")]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [doneInfo, setDoneInfo] = useState<{ at: string; count: number } | null>(null);

  const allValid = members.every(memberIsValid);

  function chooseMode(m: Mode) {
    setMode(m);
    setMembers([emptyMember("you")]);
    setStep("form");
  }

  function updateMember(key: string, next: MemberData) {
    setMembers((arr) => arr.map((m) => (m.key === key ? next : m)));
  }

  function addFriend() {
    if (members.length >= 12) return;
    setMembers((arr) => [...arr, emptyMember(`friend-${arr.length}-${Date.now()}`)]);
  }

  function removeFriend(key: string) {
    setMembers((arr) => arr.filter((m) => m.key !== key));
  }

  async function submit() {
    if (!allValid || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: mode === "GROUP" ? "group" : "solo",
          members: members.map((m) => ({
            fullName: memberFullName(m),
            childhoodUrl: m.childhood!.originalUrl,
            adultUrl: m.adult!.originalUrl,
            graduationUrl: m.adult!.graduationUrl,
            gradStatus: m.adult!.gradStatus,
          })),
        }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "تعذر حفظ التقديم");
      setDoneInfo({ at: j.submittedAt, count: j.count });
      setStep("done");
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "حدث خطأ");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setMembers([emptyMember("you")]);
    setMode("SOLO");
    setDoneInfo(null);
    setStep("mode");
  }

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 right-1/2 h-130 w-130 translate-x-1/2 rounded-full bg-gold-500/10 blur-[140px]" />
        <div className="absolute bottom-0 left-0 h-90 w-90 rounded-full bg-purple-500/10 blur-[120px]" />
      </div>

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
        <div className="flex items-center gap-3">
          <span className="rounded-2xl border border-gold-500/40 bg-gold-500/10 p-2.5">
            <GraduationCap className="size-6 text-gold-400" />
          </span>
          <div>
            <p className="font-display text-lg leading-none font-bold gold-text">حفل التخرج</p>
          </div>
        </div>
        {step !== "mode" && step !== "done" && (
          <button onClick={() => setStep("mode")} className="btn-ghost inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold">
            <RotateCcw className="size-3.5" /> البداية
          </button>
        )}
      </header>

      {step === "mode" && (
        <section className="relative z-10 mx-auto flex min-h-[78dvh] max-w-6xl flex-col items-center justify-center px-5 pb-20 text-center">
          <Dust />
          <div className="animate-rise">
            <span className="mx-auto mb-8 inline-flex items-center gap-2 rounded-full border border-gold-500/30 bg-gold-500/5 px-5 py-2 text-xs font-bold text-gold-300">
              <Sparkles className="size-3.5" />
              سجل نفسك في ألبوم التخرج
            </span>
            <h1 className="font-display text-5xl leading-[1.15] font-bold text-ivory sm:text-7xl lg:text-8xl">
              أخيراً
              <br />
              <span className="gold-text animate-shimmer">لبسنا القبعة</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-ivory/55 sm:text-base">
              ارفع صورتك وأنت صغير وصورتك دلوقتي عشان تظهر بالاسم على الشاشة في الحفلة
            </p>
          </div>

          <div className="mt-12 grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
            <button onClick={() => chooseMode("SOLO")} className="btn-gold group relative overflow-hidden rounded-3xl p-7 text-right">
              <span className="relative z-10">
                <UserRound className="mb-4 size-9" />
                <span className="block text-xl font-black">هقدّم نفسي</span>
                <span className="mt-1 block text-xs font-semibold opacity-70">تقديم فردي — اسم + صورتين</span>
              </span>
              <ArrowLeft className="absolute bottom-6 left-6 size-5 transition-transform group-hover:-translate-x-1" />
            </button>
            <button onClick={() => chooseMode("GROUP")} className="card-lux group relative overflow-hidden rounded-3xl border-gold-500/40 p-7 text-right transition-transform hover:-translate-y-1">
              <UsersRound className="mb-4 size-9 text-gold-400" />
              <span className="block text-xl font-black text-gold-200">أنا وأصحابي</span>
              <span className="mt-1 block text-xs font-semibold text-ivory/50">جروب — كل واحد باسمه وصورته تحت بعض</span>
              <ArrowLeft className="absolute bottom-6 left-6 size-5 text-gold-400 transition-transform group-hover:-translate-x-1" />
            </button>
          </div>
        </section>
      )}

      {step === "form" && (
        <section className="relative z-10 mx-auto max-w-4xl px-5 pb-24">
          <StepHeader current={1} title={mode === "GROUP" ? "بياناتك وبيانات أصحابك" : "بياناتك"} hint="اكتب الاسم رباعي وارفع صورة الطفولة والصورة الحالية لكل واحد" />
          <div className="space-y-6">
            {members.map((m, i) => (
              <div key={m.key} className="animate-fade-up">
                <MemberForm
                  member={m}
                  title={i === 0 ? "أنت" : `صاحبك رقم ${i}`}
                  subtitle={i === 0 ? "هتظهر بهذه البيانات في عرض التخرج" : "بيانات صاحبك كما ستظهر على الشاشة"}
                  removable={i > 0}
                  onChange={(next) => updateMember(m.key, next)}
                  onRemove={() => removeFriend(m.key)}
                />
              </div>
            ))}
          </div>

          {mode === "GROUP" && members.length < 12 && (
            <button onClick={addFriend} className="btn-ghost mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border-dashed py-4 text-sm font-black">
              <Plus className="size-4" /> أضِف صاحبك
            </button>
          )}

          <div className="mt-10 flex items-center justify-between">
            <button onClick={() => setStep("mode")} className="btn-ghost inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold"><ArrowRight className="size-4" /> رجوع</button>
            <button onClick={() => setStep("review")} disabled={!allValid} className="btn-gold inline-flex items-center gap-2 rounded-xl px-8 py-3 text-sm">معاينة قبل التسليم <ArrowLeft className="size-4" /></button>
          </div>
          {!allValid && <p className="mt-3 text-center text-xs text-ivory/45">أكمِل الاسم الرباعي والصورتين {mode === "GROUP" ? "لكل الأعضاء" : ""} لتفعيل المعاينة</p>}
        </section>
      )}

      {step === "review" && (
        <section className="relative z-10 mx-auto max-w-5xl px-5 pb-24">
          <StepHeader current={2} title="المعاينة النهائية" hint="راجع صورك وبياناتك قبل التسليم — هكذا ستظهر لحظتك على الشاشة" />
          <div className="space-y-8">
            {members.map((m, i) => (
              <article key={m.key} className="card-lux animate-fade-up rounded-3xl p-5 sm:p-8" style={{ animationDelay: `${i * 0.08}s` }}>
                <h3 className="mb-1 font-display text-2xl font-bold text-gold-200">{memberFullName(m)}</h3>
                <p className="mb-6 text-[11px] font-bold text-ivory/40">{mode === "GROUP" ? `عضو في الجروب — الترتيب ${i + 1}` : "تقديم فردي"}</p>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <figure>
                    <div className="overflow-hidden rounded-2xl border border-gold-500/25">
                      <img src={m.childhood!.originalUrl} alt="صورة الطفولة" className="photo-old aspect-[4/5] w-full object-cover" />
                    </div>
                    <figcaption className="mt-2 text-center text-xs font-bold text-ivory/50">وأنت صغير</figcaption>
                  </figure>
                  <figure>
                    <div className="lux-frame lux-corner overflow-hidden rounded-2xl">
                      <img src={m.adult!.graduationUrl ?? m.adult!.originalUrl} alt="صورة التخرج" className="aspect-[4/5] w-full object-cover" />
                    </div>
                    <figcaption className="mt-2 flex items-center justify-center gap-1.5 text-xs font-bold text-gold-300"><GraduationCap className="size-3.5" /> لحظة التخرج {m.adult!.gradStatus === "FAILED" && <span className="text-amber-300/90">(ستُعالج القبعة من الإدارة)</span>}</figcaption>
                  </figure>
                </div>
              </article>
            ))}
          </div>

          {submitError && <p className="mt-6 rounded-2xl border border-red-400/30 bg-red-500/10 px-5 py-3 text-center text-sm font-bold text-red-200">{submitError}</p>}

          <div className="mt-10 flex items-center justify-between">
            <button onClick={() => setStep("form")} className="btn-ghost inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold"><ArrowRight className="size-4" /> تعديل</button>
            <button onClick={submit} disabled={submitting} className="btn-gold inline-flex min-w-44 items-center justify-center gap-2 rounded-xl px-8 py-3 text-sm">{submitting ? "جاري التسليم..." : "تأكيد التسليم"} <BadgeCheck className="size-4" /></button>
          </div>
        </section>
      )}

      {step === "done" && doneInfo && (
        <section className="relative z-10 mx-auto flex min-h-[75dvh] max-w-3xl flex-col items-center justify-center px-5 pb-20 text-center">
          <PartyPopper className="mb-6 size-16 text-gold-400" />
          <h1 className="font-display text-5xl font-bold text-ivory sm:text-7xl">اتسجلت يا بطل 🎓</h1>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-ivory/55 sm:text-base">اسمك وصورك اتحفظوا، واللقطة هتظهر في العرض وقت الحفل.</p>
          <p className="mt-3 text-xs text-ivory/35">وقت التسجيل: {timeFmt.format(new Date(doneInfo.at))} — عدد الأشخاص: {doneInfo.count}</p>
          <button onClick={reset} className="btn-ghost mt-10 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold"><RotateCcw className="size-4" /> تسجيل شخص تاني</button>
        </section>
      )}

      <footer className="relative z-10 pb-8 text-center text-[11px] text-ivory/30">
        لحظة التخرج تستاهل تتعاش كويس — كل بياناتك محفوظة بأمان
        <a href="/admin" className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-[10px] text-ivory/25 transition-colors hover:border-gold-500/40 hover:text-gold-300">
          <LockKeyhole className="size-3" /> غرفة الإدارة
        </a>
      </footer>
    </main>
  );
}

function StepHeader({ current, title, hint }: { current: number; title: string; hint: string }) {
  return (
    <header className="mb-8 text-center">
      <div className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-gold-400/70">الخطوة {current} من 2</div>
      <h2 className="font-display text-4xl font-bold text-ivory">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-ivory/45">{hint}</p>
    </header>
  );
}
