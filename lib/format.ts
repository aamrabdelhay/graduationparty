/** Formatting + small text helpers shared across UI & server. */

export function pad(n: number, size = 2): string {
  return String(n).padStart(size, "0");
}

/** "Group #014" style label. Numbers beyond 999 render verbatim. */
export function groupLabel(number: number | null | undefined): string {
  if (number == null) return "—";
  return `Group #${pad(number, 3)}`;
}

/** Submission time with seconds: "23:41:07" (local time of the viewer). */
export function formatTimeHMSSec(date: Date | string, timeZone?: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("hour")}:${get("minute")}:${get("second")}`;
}

/** "04 Sep 2026 · 23:41:07" */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const day = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(d);
  return `${day} · ${formatTimeHMSSec(d)}`;
}

export function formatDateTimeMs(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${formatDateTime(d)}.${pad(d.getMilliseconds(), 3)}`;
}

/** ISO 8601 with milliseconds, UTC (server-authoritative value). */
export function toIsoMs(date: Date | string): string {
  return new Date(date).toISOString();
}

export function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
