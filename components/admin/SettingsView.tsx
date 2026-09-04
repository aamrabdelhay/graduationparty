"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDraftContext } from "@/components/admin/DraftProvider";
import { Button, ConfirmDialog, InlineMessage, SectionTitle } from "@/components/ui";
import { api, ApiError } from "@/lib/web/api";

interface SettingsPayload {
  settings: {
    mode: "AUTOMATIC" | "MANUAL";
    autoPlay: boolean;
    loopAfterQueueEnd: boolean;
    childhoodDurationMs: number;
    smokeDurationMs: number;
    adultDurationMs: number;
    nameRevealDurationMs: number;
    transitionDurationMs: number;
    displaySettings: Record<string, unknown>;
  };
  draft: { changeCount: number; draftId: string | null };
}

const DURATIONS: Array<{ key: keyof SettingsPayload["settings"]; label: string; hint: string; min: number; max: number; def: number }> = [
  { key: "childhoodDurationMs", label: "Childhood photo", hint: "How long the childhood photo stays on screen.", min: 0.3, max: 30, def: 2 },
  { key: "smokeDurationMs", label: "Smoke transition", hint: "Duration of the mist reveal.", min: 0.3, max: 30, def: 1.2 },
  { key: "adultDurationMs", label: "Graduation photo", hint: "Time the final cap photo is shown.", min: 1, max: 120, def: 5 },
  { key: "nameRevealDurationMs", label: "Name reveal", hint: "How the name animates in.", min: 0.2, max: 20, def: 0.8 },
  { key: "transitionDurationMs", label: "Cross-fade", hint: "Fade length between photos.", min: 0.1, max: 20, def: 0.8 },
];

export default function SettingsView() {
  const draft = useDraftContext();
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [draftCount, setDraftCount] = useState(0);

  const load = useCallback(async () => {
    const res = await api.get<SettingsPayload>("/api/admin/settings");
    setData(res);
    setDraftCount(res.draft.changeCount);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setDraftCount(draft.summary?.changeCount ?? 0);
  }, [draft.summary]);

  async function record(field: string, newValue: unknown) {
    try {
      await api.post("/api/admin/settings", { changes: [{ field: `settings.${field}`, newValue }] });
      await draft.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save changes.");
    }
  }

  function changeDuration(key: string, seconds: number) {
    const field = DURATIONS.find((d) => d.key === key);
    if (!field || Number.isNaN(seconds)) return;
    const ms = Math.round(Math.min(field.max, Math.max(field.min, seconds)) * 1000);
    setData((d) => (d ? { ...d, settings: { ...d.settings, [key]: ms } } : d));
    if (timers.current[key]) clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => void record(key, ms), 400);
  }

  function toggle(key: "autoPlay" | "loopAfterQueueEnd", value: boolean) {
    setData((d) => (d ? { ...d, settings: { ...d.settings, [key]: value } } : d));
    void record(key, value);
  }

  function setMode(mode: "AUTOMATIC" | "MANUAL") {
    setData((d) => (d ? { ...d, settings: { ...d.settings, mode } } : d));
    void record("mode", mode);
  }

  function setFrameTone(tone: string) {
    const next = { ...(data?.settings.displaySettings ?? {}), frameTone: tone };
    setData((d) => (d ? { ...d, settings: { ...d.settings, displaySettings: next } } : d));
    void record("displaySettings", next);
  }

  async function resetDefaults() {
    const changes = DURATIONS.map((d) => ({ field: `settings.${d.key as string}`, newValue: Math.round(d.def * 1000) }));
    setBusy(true);
    try {
      await api.post("/api/admin/settings", { changes });
      setData((d) => {
        if (!d) return d;
        const s = { ...d.settings };
        for (const c of changes) (s as Record<string, unknown>)[(c.field as string).split(".")[1]] = c.newValue;
        return { ...d, settings: s };
      });
      await draft.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save changes.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <div className="skeleton h-96 rounded-xl" />;
  const s = data.settings;
  const frameTone = String(s.displaySettings?.frameTone ?? "gold");

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionTitle sub="Changes are drafts until you press “Save changes” below.">Settings</SectionTitle>
        <Button variant="secondary" size="sm" onClick={() => void resetDefaults()} loading={busy}>
          Restore default timing
        </Button>
      </div>

      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}

      {/* Slideshow timing */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-ink-950">Slideshow timing</h2>
        <p className="mt-0.5 text-sm text-slate-500">Durations in seconds for each stage of a graduate&apos;s slide.</p>
        <div className="mt-5 grid gap-x-10 gap-y-4 sm:grid-cols-2">
          {DURATIONS.map((d) => (
            <label key={d.key} className="block">
              <span className="text-sm font-medium text-ink-900">{d.label}</span>
              <span className="ml-2 text-xs text-slate-400">{d.hint}</span>
              <div className="mt-1.5 flex items-center gap-3">
                <input
                  type="range"
                  min={d.min}
                  max={d.max}
                  step={0.1}
                  value={((s[d.key] as number) ?? d.def * 1000) / 1000}
                  onChange={(e) => changeDuration(d.key as string, Number(e.target.value))}
                  className="h-1.5 flex-1 accent-gold-600"
                  aria-label={`${d.label} duration in seconds`}
                />
                <input
                  type="number"
                  min={d.min}
                  max={d.max}
                  step={0.1}
                  value={(((s[d.key] as number) ?? d.def * 1000) / 1000).toFixed(1)}
                  onChange={(e) => changeDuration(d.key as string, Number(e.target.value))}
                  className="h-9 w-20 rounded-md border border-slate-300 px-2 text-right text-sm tabular-nums focus:border-ink-900 focus:outline-none"
                  aria-label={`${d.label} duration in seconds (number)`}
                />
                <span className="w-7 text-xs text-slate-400">sec</span>
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* Behavior */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-ink-950">Behavior</h2>
        <div className="mt-4 space-y-4">
          <RadioRow
            legend="Slideshow mode"
            value={s.mode}
            onChange={setMode}
            options={[
              { value: "AUTOMATIC", label: "Automatic", hint: "Advances on its own when the queue is running." },
              { value: "MANUAL", label: "Manual", hint: "Admin presses Next for every graduate." },
            ]}
          />
          <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-ink-900">Auto-play</p>
              <p className="text-xs text-slate-500">Automatically start showing graduates when the queue advances.</p>
            </div>
            <Toggle checked={s.autoPlay} onChange={(v) => toggle("autoPlay", v)} label="Auto-play" />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-ink-900">Loop after queue end</p>
              <p className="text-xs text-slate-500">Restart from the beginning once every graduate was shown.</p>
            </div>
            <Toggle checked={s.loopAfterQueueEnd} onChange={(v) => toggle("loopAfterQueueEnd", v)} label="Loop after queue end" />
          </div>
        </div>
      </section>

      {/* Display preferences */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-ink-950">Projector display</h2>
        <p className="mt-1 text-sm text-slate-500">Frame accent used on the big screen.</p>
        <div className="mt-4 flex gap-3">
          {[
            { tone: "gold", label: "Classic gold" },
            { tone: "ink", label: "Midnight navy" },
            { tone: "cream", label: "Ivory" },
          ].map((o) => (
            <button
              key={o.tone}
              onClick={() => setFrameTone(o.tone)}
              aria-pressed={frameTone === o.tone}
              className={`rounded-full border px-4 py-2 text-sm font-medium ${
                frameTone === o.tone ? "border-ink-900 bg-cream-100 text-ink-950" : "border-slate-300 text-slate-600 hover:border-ink-900"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {draftCount > 0 ? (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {draftCount} unsaved {draftCount === 1 ? "change" : "changes"} — they apply to the projector after you press “Save
            changes”.
          </p>
        ) : null}
      </section>

      {/* Presentation link */}
      <PresentationLinkSection onRegenerate={() => setRegenerateOpen(true)} copied={copied} setCopied={setCopied} />

      <ConfirmDialog
        open={regenerateOpen}
        onCancel={() => setRegenerateOpen(false)}
        onConfirm={() => {
          setRegenerateOpen(false);
          void regenerateLink();
        }}
        title="Generate a new projector link?"
        message="The current link stops working immediately. Anyone using the old link on a projector will see an invalid-link screen."
        confirmLabel="Generate new link"
      />

      <p className="pb-10" />
    </div>
  );

  async function regenerateLink() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/admin/presentation/token");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not generate a new link.");
    } finally {
      setBusy(false);
    }
  }
}

function PresentationLinkSection({
  onRegenerate,
  copied,
  setCopied,
}: {
  onRegenerate: () => void;
  copied: boolean;
  setCopied: (v: boolean) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const load = useCallback(async () => {
    const res = await api.get<{ url: string | null }>("/api/admin/presentation/token");
    setUrl(res.url);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — user can copy manually */
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="font-display text-lg font-semibold text-ink-950">Projector link</h2>
      <p className="mt-1 text-sm text-slate-500">
        Open this link on the projector or presentation TV. No password is needed — the random link itself is the key.
      </p>
      {url ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <code className="max-w-full flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            {url}
          </code>
          <Button variant="secondary" size="sm" onClick={() => void copy()}>
            {copied ? "Copied ✓" : "Copy link"}
          </Button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center rounded-md bg-ink-900 px-3 text-xs font-semibold text-white hover:bg-ink-800"
          >
            Open projector
          </a>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">No projector link yet.</p>
      )}
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" size="sm" onClick={onRegenerate}>
          Regenerate link
        </Button>
        {url ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-red-700 hover:bg-red-50"
            onClick={async () => {
              await api.del("/api/admin/presentation/token");
              setUrl(null);
            }}
          >
            Revoke current link
          </Button>
        ) : (
          <Button size="sm" onClick={async () => { await api.post("/api/admin/presentation/token"); await load(); }}>
            Create projector link
          </Button>
        )}
      </div>
    </section>
  );
}

function RadioRow({
  legend,
  value,
  onChange,
  options,
}: {
  legend: string;
  value: string;
  onChange: (v: "AUTOMATIC" | "MANUAL") => void;
  options: Array<{ value: "AUTOMATIC" | "MANUAL"; label: string; hint: string }>;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-ink-900">{legend}</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 ${
              value === o.value ? "border-ink-900 bg-cream-100" : "border-slate-200 hover:border-slate-400"
            }`}
          >
            <input
              type="radio"
              name="mode"
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="mt-0.5 accent-gold-600"
            />
            <span>
              <span className="block text-sm font-medium text-ink-900">{o.label}</span>
              <span className="block text-xs text-slate-500">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-gold-500" : "bg-slate-300"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`}
      />
    </button>
  );
}
