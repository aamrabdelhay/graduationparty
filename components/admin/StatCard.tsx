export function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "warn" | "danger" | "ok" | "gold";
}) {
  const accents: Record<string, string> = {
    default: "text-ink-950",
    warn: "text-amber-700",
    danger: "text-red-700",
    ok: "text-emerald-700",
    gold: "text-gold-600",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5">
      <p className="text-2xl font-semibold tracking-tight tabular-nums text-ink-950">
        <span className={accents[tone]}>{value}</span>
      </p>
      <p className="mt-0.5 text-xs font-medium text-slate-500">{label}</p>
    </div>
  );
}
