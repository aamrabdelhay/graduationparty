"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

export interface AdminParticipant {
  id: string;
  groupId: string | null;
  fullName: string;
  childhoodImageUrl: string | null;
  adultImageUrl: string | null;
  graduationImageUrl: string | null;
  gradImageStatus: "PENDING" | "PROCESSING" | "READY" | "FAILED";
  aiError: string | null;
  submissionType: "SOLO" | "GROUP";
  displayOrder: number;
  skipped: boolean;
  version: number;
  submittedAt: string;
  updatedAt: string;
}

export interface AdminGroup {
  id: string;
  createdAt: string;
}

export interface DraftItem {
  id: string;
  participantId: string;
  participantName: string | null;
  field: string;
  previousValue: string | null;
  newValue: string | null;
  updatedAt: string;
}

export interface DisplayTokenRow {
  id: string;
  token: string;
  label: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface ConflictItem {
  draftId: string;
  participantId: string;
  participantName: string;
  field: string;
  dbValue: string | null;
  yourValue: string | null;
}

export interface PresParticipant {
  id: string;
  name: string;
  childhoodImageUrl: string | null;
  graduationImageUrl: string | null;
}

export interface PresState {
  status: "IDLE" | "RUNNING" | "FINISHED";
  isPaused: boolean;
  playbackMode: string;
  queuePosition: number;
  sequenceVersion: number;
  phaseStartedAt: string | null;
  serverTime: string;
  childhoodDuration: number;
  smokeDuration: number;
  adultDuration: number;
  nameAnimationDuration: number;
  participant: PresParticipant | null;
  nextParticipant: PresParticipant | null;
}

export const timeFmt = new Intl.DateTimeFormat("ar-EG", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

export const dateTimeFmt = new Intl.DateTimeFormat("ar-EG", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

export const FIELD_LABELS: Record<string, string> = {
  fullName: "الاسم",
  childhoodImageUrl: "صورة الطفولة",
  adultImageUrl: "الصورة الحالية",
  skipped: "تخطي من العرض",
  displayOrder: "ترتيب العرض",
};

export function statusChip(status: AdminParticipant["gradImageStatus"]) {
  switch (status) {
    case "READY":
      return { label: "القبعة جاهزة", cls: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" };
    case "PROCESSING":
    case "PENDING":
      return { label: "قيد المعالجة", cls: "border-amber-400/30 bg-amber-500/10 text-amber-300" };
    case "FAILED":
      return { label: "فشل توليد القبعة", cls: "border-red-400/30 bg-red-500/10 text-red-300" };
  }
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-night-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className={`card-lux lux-frame relative max-h-[88dvh] w-full animate-fade-up overflow-y-auto rounded-3xl p-6 ${wide ? "max-w-3xl" : "max-w-lg"}`}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-display text-xl font-bold text-gold-200">{title}</h3>
          <button onClick={onClose} className="rounded-xl border border-white/10 p-2 text-ivory/50 hover:border-gold-500/40 hover:text-gold-300" aria-label="إغلاق">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Thumb({ url, alt, className }: { url?: string | null; alt: string; className?: string }) {
  const imageClassName = className ?? "h-16 w-14 rounded-lg border border-gold-500/25 object-cover";
  if (!url) {
    return <span className={`${imageClassName} flex items-center justify-center bg-white/5 text-[9px] text-ivory/30`}>لا توجد</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className={imageClassName} />
  );
}
