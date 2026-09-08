"use client";

import { useEffect, useRef, useState } from "react";
import {
  Camera,
  GraduationCap,
  ImagePlus,
  Loader2,
  RefreshCw,
  TriangleAlert,
  BadgeCheck,
} from "lucide-react";

export interface StagedImage {
  originalUrl: string;
  graduationUrl: string | null;
  gradStatus: "READY" | "FAILED" | null;
  gradError?: string | null;
}

const ACCEPT = new Set(["image/jpeg", "image/png", "image/webp"]);

export default function UploadField({
  label,
  hint,
  kind,
  value,
  onChange,
  oldStyle = false,
}: {
  label: string;
  hint?: string;
  kind: "childhood" | "adult";
  value: StagedImage | null;
  onChange: (v: StagedImage | null) => void;
  oldStyle?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<false | "uploading" | "ai">(false);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState<string | null>(null);
  const [showProcessed, setShowProcessed] = useState(true);

  useEffect(() => {
    return () => {
      if (local) URL.revokeObjectURL(local);
    };
  }, [local]);

  async function handleFile(f: File) {
    setError(null);
    if (!ACCEPT.has(f.type)) {
      setError("الصيغة غير مدعومة — JPG أو PNG أو WEBP فقط");
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      setError("الصورة أكبر من 8 ميجا");
      return;
    }
    const url = URL.createObjectURL(f);
    setLocal(url);
    onChange(null);
    setShowProcessed(true);
    setBusy("uploading");
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("kind", kind);
      const phaseTimer =
        kind === "adult" ? setTimeout(() => setBusy("ai"), 1200) : null;
      const res = await fetch("/api/stage", { method: "POST", body: fd });
      if (phaseTimer) clearTimeout(phaseTimer);
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "فشل رفع الصورة");
      onChange({
        originalUrl: j.originalUrl,
        graduationUrl: j.graduationUrl,
        gradStatus: j.gradStatus,
        gradError: j.gradError,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ أثناء الرفع");
      onChange(null);
    } finally {
      setBusy(false);
    }
  }

  const previewUrl =
    kind === "adult" && value?.graduationUrl && showProcessed
      ? value.graduationUrl
      : local ?? value?.originalUrl ?? null;

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-bold text-gold-200">
          {kind === "adult" ? (
            <GraduationCap className="size-4" />
          ) : (
            <Camera className="size-4" />
          )}
          {label}
        </span>
        {kind === "adult" && value?.graduationUrl && (
          <button
            type="button"
            onClick={() => setShowProcessed((s) => !s)}
            className="text-[11px] text-gold-300/80 underline underline-offset-4 hover:text-gold-200"
          >
            {showProcessed ? "عرض الأصلية" : "عرض بالقبعة"}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group relative block aspect-[4/5] w-full overflow-hidden rounded-2xl border border-gold-500/30 bg-night-800/60 transition-all hover:border-gold-400/70"
      >
        {previewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={label}
              className={`h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03] ${oldStyle ? "photo-old" : ""}`}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-night-950/70 via-transparent to-transparent" />
            <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-night-950/80 px-3 py-1.5 text-[11px] font-bold text-gold-200">
              <RefreshCw className="size-3.5" /> تغيير الصورة
            </span>
          </>
        ) : (
          <span className="flex h-full flex-col items-center justify-center gap-3 text-ivory/50">
            <span className="rounded-full border border-dashed border-gold-500/40 p-5 transition-colors group-hover:border-gold-400">
              <ImagePlus className="size-8 text-gold-400/80" />
            </span>
            <span className="text-sm font-semibold">اضغط لاختيار صورة</span>
            {hint && <span className="px-6 text-center text-[11px]">{hint}</span>}
          </span>
        )}

        {busy && (
          <span className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-night-950/85 backdrop-blur-sm">
            {kind === "adult" ? (
              <>
                <span className="relative">
                  <GraduationCap className="size-10 animate-float-slow text-gold-400" />
                  <span className="absolute inset-0 -m-3 animate-pulse-ring rounded-full" />
                </span>
                <span className="text-sm font-bold text-gold-200">
                  {busy === "ai"
                    ? "الذكاء الاصطناعي يضيف قبعة التخرج..."
                    : "جاري رفع الصورة..."}
                </span>
              </>
            ) : (
              <>
                <Loader2 className="size-8 animate-spin text-gold-400" />
                <span className="text-sm font-bold text-gold-200">جاري رفع الصورة...</span>
              </>
            )}
          </span>
        )}
      </button>

      {kind === "adult" && value?.gradStatus === "READY" && !busy && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300/90">
          <BadgeCheck className="size-3.5" /> تمت إضافة قبعة التخرج بنجاح
        </p>
      )}
      {kind === "adult" && value?.gradStatus === "FAILED" && !busy && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-amber-300">
          <TriangleAlert className="size-3.5" />
          تعذر توليد القبعة الآن — صورتك محفوظة وستُعالَج من الإدارة
        </p>
      )}
      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-red-300">
          <TriangleAlert className="size-3.5" /> {error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
