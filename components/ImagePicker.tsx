"use client";

import { useRef, useState } from "react";
import { uploadWithProgress, type UploadProgress } from "@/lib/web/upload";
import { Spinner } from "@/components/ui";

export interface PickedImage {
  assetId: string;
  url: string;
  width?: number;
  height?: number;
}

export interface ImagePickerHandleProps {
  kind: "CHILDHOOD" | "ADULT" | "GRADUATION";
  label: string;
  description?: string;
  value: PickedImage | null;
  /** Called when a new image was uploaded & stored (staged asset). */
  onChange: (image: PickedImage) => void;
  /** Called when the user removes the current image. */
  onRemove?: () => void;
  allowCamera?: boolean;
  uploadPath?: string;
  accent?: "dark" | "light";
  ariaLabel: string;
}

const MAX_MB = 10;

export function clientValidateFile(file: File): string | null {
  const okTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (!okTypes.includes(file.type)) {
    return "Please upload a JPG, PNG or WebP image.";
  }
  if (file.size === 0) return "The file appears to be empty. Please choose another photo.";
  if (file.size > MAX_MB * 1024 * 1024) {
    return `The image is larger than ${MAX_MB} MB. Please upload a smaller image.`;
  }
  return null;
}

export default function ImagePicker({
  kind,
  label,
  description,
  value,
  onChange,
  onRemove,
  allowCamera = true,
  uploadPath = "/api/uploads",
  accent = "dark",
  ariaLabel,
}: ImagePickerHandleProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    setError(null);
    const clientError = clientValidateFile(file);
    if (clientError) {
      setError(clientError);
      return;
    }
    setUploading(true);
    setProgress({ percent: 0, state: "uploading" });
    try {
      const result = await uploadWithProgress(uploadPath, file, kind, (p) => setProgress(p));
      onChange({ assetId: result.asset.id, url: result.asset.url, width: result.asset.width, height: result.asset.height });
    } catch (err) {
      setError((err as Error).message || "Image upload failed. Please try again.");
    } finally {
      setUploading(false);
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  }

  return (
    <div className="w-full">
      <div
        className={`relative overflow-hidden rounded-xl border ${
          value ? "border-transparent" : "border-dashed border-slate-300"
        }`}
      >
        {value ? (
          <div className="group relative aspect-square w-full overflow-hidden bg-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value.url} alt={`${label} preview`} className="h-full w-full object-cover" />
            {uploading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink-950/55 text-white">
                <Spinner className="h-7 w-7 border-2" />
                <span className="text-xs font-medium">Uploading… {progress?.percent ?? 0}%</span>
              </div>
            ) : (
              <div className="absolute inset-x-0 bottom-0 flex translate-y-full justify-end gap-1 bg-gradient-to-t from-black/70 to-transparent p-2 transition-transform group-hover:translate-y-0 focus-within:translate-y-0">
                <label className="cursor-pointer rounded-md bg-white/95 px-2.5 py-1.5 text-xs font-semibold text-ink-900 hover:bg-white">
                  Replace
                  <input
                    className="sr-only"
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                    aria-label={`Replace ${label}`}
                  />
                </label>
                {onRemove ? (
                  <button
                    type="button"
                    onClick={onRemove}
                    className="rounded-md bg-white/95 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-white"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            )}
            {!uploading && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="absolute right-2 top-2 rounded-md bg-black/50 px-2 py-1 text-[11px] font-medium text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 focus:opacity-100"
              >
                Change
              </button>
            )}
          </div>
        ) : (
          <div
            className={`flex aspect-square w-full flex-col items-center justify-center gap-3 px-6 text-center ${
              accent === "dark" ? "bg-ink-900 text-white" : "bg-white text-ink-900"
            }`}
          >
            {uploading ? (
              <>
                <Spinner className="h-8 w-8 border-2 text-gold-400" />
                <p className="text-sm font-medium">Uploading…</p>
                <div className="h-1.5 w-40 overflow-hidden rounded-full bg-black/25">
                  <div
                    className="h-full bg-gold-400 transition-all duration-150"
                    style={{ width: `${progress?.percent ?? 0}%` }}
                  />
                </div>
              </>
            ) : (
              <>
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="opacity-70">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="m21 15-3.5-3.5a2 2 0 0 0-2.8 0L6 20" />
                </svg>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs leading-relaxed opacity-70">{description ?? "JPG, PNG or WebP · up to 10 MB"}</p>
                <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="rounded-lg bg-gold-500 px-3.5 py-2 text-xs font-bold text-ink-950 hover:bg-gold-400"
                  >
                    Choose photo
                  </button>
                  {allowCamera ? (
                    <button
                      type="button"
                      onClick={() => cameraRef.current?.click()}
                      className="rounded-lg border border-white/25 px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/10"
                    >
                      Take a photo
                    </button>
                  ) : null}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        className="sr-only"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        aria-label={ariaLabel}
      />
      {allowCamera ? (
        <input
          ref={cameraRef}
          type="file"
          className="sr-only"
          accept="image/*"
          capture="environment"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          aria-label={`Take ${label} with camera`}
        />
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}
