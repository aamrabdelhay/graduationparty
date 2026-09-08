"use client";

import { Baby, Trash2, UserRound } from "lucide-react";
import UploadField, { StagedImage } from "./UploadField";

export interface MemberData {
  key: string;
  nameParts: string[];
  childhood: StagedImage | null;
  adult: StagedImage | null;
}

export const emptyMember = (key: string): MemberData => ({
  key,
  nameParts: ["", "", "", ""],
  childhood: null,
  adult: null,
});

const NAME_LABELS = ["الاسم الأول", "اسم الأب", "اسم الجد", "اسم العائلة"];

export default function MemberForm({
  member,
  title,
  subtitle,
  removable,
  onChange,
  onRemove,
}: {
  member: MemberData;
  title: string;
  subtitle?: string;
  removable?: boolean;
  onChange: (m: MemberData) => void;
  onRemove?: () => void;
}) {
  return (
    <section className="card-lux relative rounded-3xl p-5 sm:p-7">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-black text-gold-200">
            <UserRound className="size-5 text-gold-400" />
            {title}
          </h3>
          {subtitle && <p className="mt-1 text-xs text-ivory/50">{subtitle}</p>}
        </div>
        {removable && (
          <button
            type="button"
            onClick={onRemove}
            className="btn-danger inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold"
          >
            <Trash2 className="size-3.5" /> حذف
          </button>
        )}
      </header>

      <div className="mb-5">
        <p className="mb-2 text-xs font-bold text-ivory/60">
          الاسم رباعي <span className="text-red-300">*</span>
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {NAME_LABELS.map((ph, i) => (
            <input
              key={ph}
              value={member.nameParts[i]}
              onChange={(e) => {
                const nameParts = [...member.nameParts];
                nameParts[i] = e.target.value;
                onChange({ ...member, nameParts });
              }}
              placeholder={ph}
              className="input-lux rounded-xl px-3 py-2.5 text-sm font-semibold"
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <UploadField
          kind="childhood"
          label="صورتك وأنت صغير"
          hint="صورة طفولة واضحة"
          oldStyle
          value={member.childhood}
          onChange={(childhood) => onChange({ ...member, childhood })}
        />
        <UploadField
          kind="adult"
          label="صورتك دلوقتي"
          hint="سيتم إضافة قبعة التخرج تلقائيًا بالذكاء الاصطناعي"
          value={member.adult}
          onChange={(adult) => onChange({ ...member, adult })}
        />
      </div>
    </section>
  );
}

export function memberFullName(m: MemberData): string {
  return m.nameParts.map((s) => s.trim()).filter(Boolean).join(" ");
}

export function memberIsValid(m: MemberData): boolean {
  return (
    m.nameParts.filter((s) => s.trim().length > 0).length >= 4 &&
    !!m.childhood &&
    !!m.adult
  );
}

export function memberProgress(m: MemberData): boolean {
  // true while any upload is mid-flight (value null but user picked something is
  // tracked by UploadField; here we simply report whether both are attached).
  return !!m.childhood && !!m.adult;
}

export { Baby as BabyIcon };
