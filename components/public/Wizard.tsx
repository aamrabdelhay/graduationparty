"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ImagePicker from "@/components/ImagePicker";
import { Button, InlineMessage, Modal, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/web/api";
import {
  clearDraft,
  deleteStagedAsset,
  emptyParticipant,
  loadDraft,
  newLocalId,
  saveDraft,
  type DraftImage,
  type DraftParticipant,
  type SubmissionDraft,
} from "@/lib/web/submission";

type Mode = "individual" | "group";

function Title({ children }: { children: React.ReactNode }) {
  return <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-950 sm:text-3xl">{children}</h1>;
}

export default function Wizard() {
  const router = useRouter();
  const params = useSearchParams();
  const [draft, setDraft] = useState<SubmissionDraft | null>(null);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    const existing = loadDraft();
    const wantResume = params.get("resume") === "1";
    const typeParam = params.get("type");
    const mode: Mode | null = typeParam === "individual" || typeParam === "group" ? typeParam : null;
    if (wantResume && existing) {
      setDraft(existing);
    } else if (mode) {
      setDraft({
        version: 1,
        type: mode,
        step: "participants",
        participants: mode === "individual" ? [emptyParticipant()] : [emptyParticipant(), emptyParticipant()],
        updatedAt: new Date().toISOString(),
      });
    } else if (existing) {
      setDraft(existing);
    }
    setBooted(true);
  }, [params]);

  useEffect(() => {
    if (draft) saveDraft(draft);
  }, [draft]);

  const update = useCallback((patch: Partial<SubmissionDraft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }, []);

  const updateParticipant = useCallback((localId: string, patch: Partial<DraftParticipant>) => {
    setDraft((d) =>
      d
        ? {
            ...d,
            participants: d.participants.map((p) => (p.localId === localId ? { ...p, ...patch } : p)),
          }
        : d,
    );
  }, []);

  const setImage = useCallback(
    async (localId: string, field: "childhood" | "adult" | "graduation", img: DraftImage) => {
      const participant = draft?.participants.find((p) => p.localId === localId);
      const previous = participant?.[field];
      if (previous && previous.assetId !== img.assetId) {
        await deleteStagedAsset(previous.assetId).catch(() => undefined);
      }
      updateParticipant(localId, { [field]: img });
    },
    [draft, updateParticipant],
  );

  const removeImage = useCallback(
    async (localId: string, field: "childhood" | "adult" | "graduation") => {
      const participant = draft?.participants.find((p) => p.localId === localId);
      const assetId = participant?.[field]?.assetId;
      await deleteStagedAsset(assetId).catch(() => undefined);
      if (field === "adult") {
        // dropping the adult photo invalidates any generated graduation image
        await deleteStagedAsset(participant?.graduation?.assetId).catch(() => undefined);
        updateParticipant(localId, { adult: null, graduation: null, aiStatus: "PENDING" });
      } else {
        updateParticipant(localId, { [field]: null, ...(field === "graduation" ? { aiStatus: "PENDING" } : {}) });
      }
    },
    [draft, updateParticipant],
  );

  if (!booted) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center text-slate-400">
        <Spinner className="h-7 w-7 border-2" />
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-slate-600">Nothing to do here yet.</p>
        <Link href="/" className="text-sm font-semibold text-ink-900 underline underline-offset-4">
          Back to home
        </Link>
      </div>
    );
  }

  const mode: Mode = draft.type;
  const step = draft.step;
  const participants = draft.participants;

  const validNames = participants.every((p) => p.fullName.trim().length >= 2);
  const validPhotos = participants.every((p) => p.childhood && p.adult);

  return (
    <div className="min-h-[100dvh] bg-cream-50">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="font-display text-lg font-semibold tracking-tight text-ink-950">
            Graduation Party
          </Link>
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <span className={step === "participants" ? "text-gold-600" : ""}>Details</span>
            <span>→</span>
            <span className={step === "preview" ? "text-gold-600" : ""}>Preview</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        {step === "participants" ? (
          <ParticipantsStep
            mode={mode}
            participants={participants}
            onName={(id, v) => updateParticipant(id, { fullName: v })}
            onImage={setImage}
            onRemoveImage={removeImage}
            onAddFriend={() => update({ participants: [...participants, emptyParticipant()] })}
            onRemoveFriend={(id) => {
              const p = participants.find((x) => x.localId === id);
              if (!p) return;
              void Promise.all([
                deleteStagedAsset(p.childhood?.assetId),
                deleteStagedAsset(p.adult?.assetId),
                deleteStagedAsset(p.graduation?.assetId),
              ]);
              update({ participants: participants.filter((x) => x.localId !== id) });
            }}
            canContinue={validNames && validPhotos}
            onNext={() => update({ step: "preview" })}
          />
        ) : (
          <PreviewStep
            mode={mode}
            participants={participants}
            onBack={() => update({ step: "participants" })}
            onRemove={(id) => {
              const p = participants.find((x) => x.localId === id);
              if (!p) return;
              void Promise.all([
                deleteStagedAsset(p.childhood?.assetId),
                deleteStagedAsset(p.adult?.assetId),
                deleteStagedAsset(p.graduation?.assetId),
              ]);
              update({ participants: participants.filter((x) => x.localId !== id) });
            }}
            onRegenerate={async (id) => {
              await generateCap(participants.find((x) => x.localId === id)!, updateParticipant);
            }}
            onConfirm={async () => {
              await confirmSubmission(draft, router);
            }}
          />
        )}
      </main>
    </div>
  );
}

/* ---------------------------- generation helper ----------------------------- */

export async function generateCap(p: DraftParticipant, set: (id: string, patch: Partial<DraftParticipant>) => void) {
  if (!p.adult) return;
  set(p.localId, { aiStatus: "PROCESSING", aiError: null });
  try {
    const oldGrad = p.graduation;
    const res = await api.post<{ asset: { id: string; url: string; width: number; height: number } }>(
      "/api/draft/generate-cap",
      { adultAssetId: p.adult.assetId },
    );
    if (oldGrad) await deleteStagedAsset(oldGrad.assetId).catch(() => undefined);
    set(p.localId, {
      graduation: {
        assetId: res.asset.id,
        url: res.asset.url,
        width: res.asset.width,
        height: res.asset.height,
      },
      aiStatus: "COMPLETED",
      aiError: null,
    });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : "Graduation cap generation failed. You can retry.";
    set(p.localId, { aiStatus: "FAILED", aiError: message });
  }
}

async function confirmSubmission(draft: SubmissionDraft, router: ReturnType<typeof useRouter>) {
  const payload = {
    type: draft.type === "individual" ? "INDIVIDUAL" : "GROUP",
    participants: draft.participants.map((p) => ({
      fullName: p.fullName.trim().replace(/\s+/g, " "),
      childhoodImageId: p.childhood!.assetId,
      adultImageId: p.adult!.assetId,
      graduationImageId: p.graduation?.assetId ?? null,
    })),
  };
  const res = await api.post<{ submissionId: string }>("/api/submit", payload);
  clearDraft();
  router.push(`/success?ref=${encodeURIComponent(res.submissionId)}`);
}

/* ------------------------------- Participants -------------------------------- */

function ParticipantsStep({
  mode,
  participants,
  onName,
  onImage,
  onRemoveImage,
  onAddFriend,
  onRemoveFriend,
  canContinue,
  onNext,
}: {
  mode: Mode;
  participants: DraftParticipant[];
  onName: (id: string, v: string) => void;
  onImage: (id: string, field: "childhood" | "adult" | "graduation", img: DraftImage) => void;
  onRemoveImage: (id: string, field: "childhood" | "adult" | "graduation") => void;
  onAddFriend: () => void;
  onRemoveFriend: (id: string) => void;
  canContinue: boolean;
  onNext: () => void;
}) {
  const [active, setActive] = useState(0);
  const current = participants[active];
  const lastOf = participants.length - 1;

  const canForward = participants.slice(0, active + 1).every((p) => p.fullName.trim().length >= 2 && p.childhood && p.adult);
  const back = () => setActive((a) => Math.max(0, a - 1));

  return (
    <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
      {/* People rail */}
      <aside aria-label="People in this submission">
        <div className="space-y-1.5">
          {participants.map((p, i) => (
            <button
              key={p.localId}
              type="button"
              onClick={() => setActive(i)}
              className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
                i === active ? "border-ink-900 bg-white shadow-sm" : "border-transparent bg-white/60 hover:bg-white"
              }`}
              aria-current={i === active ? "step" : undefined}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                  i === active ? "bg-gold-500 text-ink-950" : "bg-slate-200 text-slate-600"
                }`}
              >
                {i === 0 ? (mode === "individual" ? "1" : "You") : i}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink-900">
                  {p.fullName.trim() || (i === 0 ? (mode === "individual" ? "Your details" : "You") : `Friend ${i}`)}
                </span>
                <span className="block text-[11px] text-slate-500">
                  {p.childhood && p.adult ? "Photos ready" : "Photos needed"}
                </span>
              </span>
              {participants.length > (mode === "individual" ? 1 : 1) && i > 0 && active !== i ? (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFriend(p.localId);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                      onRemoveFriend(p.localId);
                    }
                  }}
                  className="ml-auto rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label={`Remove ${p.fullName || `friend ${i}`}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </span>
              ) : null}
            </button>
          ))}
          {mode === "group" ? (
            <button
              type="button"
              onClick={onAddFriend}
              className="flex w-full items-center gap-3 rounded-xl border border-dashed border-slate-300 px-3.5 py-3 text-sm font-medium text-slate-600 hover:border-ink-900 hover:text-ink-900"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg leading-none">+</span>
              Add friend
            </button>
          ) : null}
        </div>
        <p className="mt-4 hidden text-xs leading-relaxed text-slate-500 lg:block">
          Your progress is saved automatically on this device.
        </p>
      </aside>

      {/* Editor */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        {current ? (
          <div key={current.localId} className="space-y-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gold-600">
                  {mode === "individual"
                    ? "Participant"
                    : active === 0
                      ? "You (first participant)"
                      : `Friend ${active}`}
                </p>
                <h2 className="font-display mt-1 text-xl font-semibold text-ink-950">Your details</h2>
              </div>
              {mode === "group" && active > 0 ? (
                <Button variant="ghost" size="sm" onClick={() => onRemoveFriend(current.localId)}>
                  Remove
                </Button>
              ) : null}
            </div>

            <div className="space-y-2">
              <label htmlFor={`name-${current.localId}`} className="block text-sm font-medium text-ink-800">
                Full name
              </label>
              <input
                id={`name-${current.localId}`}
                value={current.fullName}
                onChange={(e) => onName(current.localId, e.target.value)}
                placeholder="e.g. First Middle Last"
                autoComplete="name"
                dir="auto"
                className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-gold-500/50"
              />
              <p className="text-xs text-slate-500">Enter your full name as it should appear on screen.</p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <PhotoSlot
                title="Childhood photo"
                hint="A photo of you when you were young."
                picker={
                  <ImagePicker
                    kind="CHILDHOOD"
                    label="Childhood photo"
                    value={current.childhood}
                    onChange={(img) => void onImage(current.localId, "childhood", img)}
                    onRemove={current.childhood ? () => void onRemoveImage(current.localId, "childhood") : undefined}
                    ariaLabel="Upload childhood photo"
                  />
                }
              />
              <PhotoSlot
                title="Adult photo"
                hint="A recent photo — we will add your graduation cap here."
                picker={
                  <ImagePicker
                    kind="ADULT"
                    label="Adult photo"
                    value={current.adult}
                    onChange={(img) => void onImage(current.localId, "adult", img)}
                    onRemove={current.adult ? () => void onRemoveImage(current.localId, "adult") : undefined}
                    ariaLabel="Upload adult photo"
                  />
                }
              />
            </div>

            <CapGeneratorCard participant={current} onGenerated={(img) => onImage(current.localId, "graduation", img)} />
          </div>
        ) : null}

        <div className="mt-8 flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
          <Button variant="ghost" onClick={() => (active > 0 ? back() : undefined)} disabled={active === 0}>
            Back
          </Button>
          <div className="flex items-center gap-3">
            {mode === "group" && active < lastOf ? (
              <Button variant="secondary" onClick={() => setActive((a) => Math.min(lastOf, a + 1))}>
                Next person
              </Button>
            ) : null}
            <Button onClick={onNext} disabled={!canContinue} title={canContinue ? "" : "Complete all names and photos to continue"}>
              Preview my entry →
            </Button>
          </div>
        </div>
        {!canContinue ? (
          <p className="mt-3 text-right text-xs text-slate-500">
            Add a full name, a childhood photo and an adult photo for every person to continue.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PhotoSlot({ title, hint, picker }: { title: string; hint: string; picker: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-semibold text-ink-900">{title}</p>
      <p className="mb-2 text-xs text-slate-500">{hint}</p>
      {picker}
    </div>
  );
}

/* ------------------------------ Cap generator ------------------------------- */

function CapGeneratorCard({
  participant,
  onGenerated,
}: {
  participant: DraftParticipant;
  onGenerated: (img: DraftImage) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!participant.adult) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-cream-50 px-4 py-3 text-xs text-slate-500">
        After uploading your adult photo you can generate your AI graduation photo.
      </div>
    );
  }

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await generateCap(participant, (id, patch) => {
        if (patch.graduation) onGenerated(patch.graduation);
      });
      // refresh from state handled by parent via onGenerated; ensure error shown:
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Graduation cap generation failed. You can retry.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-ink-900">Graduation photo</p>
          <p className="text-xs text-slate-500">Generated by AI from your adult photo — your original is never changed.</p>
        </div>
        {participant.graduation ? (
          <Button variant="secondary" size="sm" onClick={() => void run()} disabled={busy}>
            {busy ? "Generating…" : "Regenerate"}
          </Button>
        ) : (
          <Button size="sm" onClick={() => void run()} disabled={busy} loading={busy}>
            Generate my cap
          </Button>
        )}
      </div>

      {participant.graduation ? (
        <div className="flex items-center gap-4">
          <div className="h-24 w-24 overflow-hidden rounded-lg border border-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={participant.graduation.url} alt="AI-generated graduation photo preview" className="h-full w-full object-cover" />
          </div>
          <div className="flex-1">
            {busy ? (
              <p className="flex items-center gap-2 text-sm text-slate-600">
                <Spinner className="h-4 w-4 border-2" /> Generating… this may take a moment.
              </p>
            ) : (
              <p className="text-sm text-emerald-800">Your graduation photo is ready. ✓</p>
            )}
            {error ? <p className="mt-1 text-sm text-red-700">{error}</p> : null}
          </div>
        </div>
      ) : (
        <div>
          {busy ? (
            <div className="rounded-xl border border-slate-200 bg-cream-50 p-5 text-sm text-slate-600">
              <span className="flex items-center gap-2">
                <Spinner className="h-4 w-4 border-2" /> Adding your graduation cap… this may take a moment.
              </span>
            </div>
          ) : error ? (
            <InlineMessage tone="error">{error}</InlineMessage>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-200 bg-cream-50 px-4 py-3 text-xs text-slate-500">
              The generated photo will appear here for preview before you submit.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- Preview ---------------------------------- */

function PreviewStep({
  mode,
  participants,
  onBack,
  onRemove,
  onRegenerate,
  onConfirm,
}: {
  mode: Mode;
  participants: DraftParticipant[];
  onBack: () => void;
  onRemove: (id: string) => void;
  onRegenerate: (id: string) => Promise<void>;
  onConfirm: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
      // success: wizard clears draft and router pushes /success
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "We could not save your submission. Please try again.");
      setSubmitting(false);
    }
  };

  const confirmAllowed = participants.every((p) => p.fullName.trim().length >= 2 && p.childhood && p.adult);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gold-600">Step 2 of 2</p>
          <Title>
            {mode === "individual" ? "Review your entry" : "Review your group entry"}
          </Title>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {participants.length} {participants.length === 1 ? "person" : "people"} · nothing is submitted until you confirm below.
          </p>
        </div>
        <Button variant="secondary" onClick={onBack}>
          ← Edit details
        </Button>
      </div>

      <ol className="space-y-8">
        {participants.map((p, i) => (
          <li
            key={p.localId}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                  {mode === "individual" ? "Graduate" : i === 0 ? "You" : `Friend ${i}`}
                </p>
                <h3 className="font-display text-lg font-semibold text-ink-950">{p.fullName || "Full name needed"}</h3>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={onBack}>
                  Edit
                </Button>
                {participants.length > 1 ? (
                  <Button variant="ghost" size="sm" onClick={() => onRemove(p.localId)} className="text-red-700 hover:bg-red-50">
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Figure label="Childhood" src={p.childhood?.url} alt={`${p.fullName} childhood photo`} />
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Graduation</span>
                  {p.adult ? (
                    <button
                      type="button"
                      onClick={async () => {
                        setRegenerating(p.localId);
                        await onRegenerate(p.localId);
                        setRegenerating(null);
                      }}
                      disabled={regenerating === p.localId}
                      className="text-xs font-semibold text-ink-900 underline decoration-slate-300 underline-offset-4 hover:decoration-gold-500"
                    >
                      {regenerating === p.localId ? "Generating…" : "Regenerate cap"}
                    </button>
                  ) : null}
                </div>
                {p.graduation ? (
                  <Figure label="Graduation" src={p.graduation.url} alt={`${p.fullName} AI graduation photo`} />
                ) : p.adult ? (
                  <div className="relative">
                    <Figure label="Adult (cap pending)" src={p.adult.url} alt={`${p.fullName} adult photo`} dim />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="rounded-full bg-ink-950/70 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
                        {p.aiStatus === "PROCESSING" ? "Generating…" : "Cap not generated yet"}
                      </span>
                    </span>
                  </div>
                ) : (
                  <div className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-slate-200 text-xs text-slate-400">
                    Upload an adult photo
                  </div>
                )}
                {p.aiStatus === "FAILED" ? (
                  <p className="mt-2 text-xs font-medium text-red-700">{p.aiError ?? "Graduation cap generation failed. You can retry."}</p>
                ) : null}
                {p.aiStatus === "PROCESSING" ? (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                    <Spinner className="h-3 w-3 border-2" /> Processing…
                  </p>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="rounded-2xl bg-ink-950 p-6 text-white sm:p-7">
        <h3 className="font-display text-lg font-semibold">Ready to submit?</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-300">
          By confirming, {mode === "individual" ? "your" : "your group’s"} submission is sent to the event team with the server’s
          exact time. Photos without a generated cap are saved automatically and can be generated by the organizers later.
        </p>
        {error ? (
          <div className="mt-4">
            <InlineMessage tone="error">{error}</InlineMessage>
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button variant="gold" size="lg" onClick={() => setConfirmOpen(true)} disabled={!confirmAllowed || submitting} loading={submitting}>
            Confirm & Submit
          </Button>
          {!confirmAllowed ? <span className="text-xs text-slate-400">Complete every name and both photos first.</span> : null}
        </div>
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm your submission?">
        <p className="text-sm leading-relaxed text-slate-700">
          This is the final step. Once submitted, your entry cannot be edited from this device — please double-check the name and
          photos above. (The organizers can always help you adjust it later.)
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
            Keep reviewing
          </Button>
          <Button variant="gold" onClick={() => void handleConfirm()} loading={submitting}>
            Confirm & Submit
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Figure({ label, src, alt, dim }: { label: string; src?: string; alt: string; dim?: boolean }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      {src ? (
        <div className={`aspect-square w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 ${dim ? "opacity-80" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="h-full w-full object-cover" />
        </div>
      ) : null}
    </div>
  );
}
