"use client";

import { forwardRef, useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

/* ---------------------------------- Button --------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "gold";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: "bg-ink-900 text-white hover:bg-ink-800 border border-transparent",
  secondary: "bg-white text-ink-900 border border-slate-300 hover:border-ink-900 hover:bg-cream-100",
  ghost: "bg-transparent text-ink-900 hover:bg-slate-200/70 border border-transparent",
  danger: "bg-red-700 text-white hover:bg-red-800 border border-transparent",
  gold: "bg-gold-500 text-ink-950 hover:bg-gold-400 border border-transparent",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm rounded-md",
  md: "h-10 px-4 text-sm rounded-lg",
  lg: "h-12 px-6 text-base rounded-lg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, className = "", disabled, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer select-none ${variantClass[variant]} ${sizeClass[size]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Spinner className="h-4 w-4 border-[2px]" /> : null}
      {children}
    </button>
  );
});

/* ---------------------------------- Spinner --------------------------------- */

export function Spinner({ className = "h-5 w-5 border-2" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block animate-spin rounded-full border-current border-t-transparent opacity-70 ${className}`}
    />
  );
}

/* ----------------------------------- Badge ---------------------------------- */

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "amber" | "red" | "blue" | "gold" | "slate";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-slate-100 text-slate-700 border-slate-200",
    green: "bg-emerald-50 text-emerald-800 border-emerald-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    red: "bg-red-50 text-red-800 border-red-200",
    blue: "bg-sky-50 text-sky-800 border-sky-200",
    gold: "bg-gold-500/10 text-gold-700 border-gold-500/30",
    slate: "bg-slate-200 text-slate-800 border-slate-300",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function aiStatusBadge(status: string): { label: string; tone: "neutral" | "green" | "amber" | "red" | "blue" | "gold" | "slate" } {
  switch (status) {
    case "COMPLETED":
      return { label: "Completed", tone: "green" };
    case "PENDING":
      return { label: "Pending", tone: "amber" };
    case "PROCESSING":
      return { label: "Processing…", tone: "blue" };
    case "FAILED":
      return { label: "Failed", tone: "red" };
    default:
      return { label: status, tone: "neutral" };
  }
}

export function presentationStatusBadge(status: string): { label: string; tone: "neutral" | "green" | "amber" | "red" | "blue" | "gold" | "slate" } {
  switch (status) {
    case "QUEUED":
      return { label: "Queued", tone: "slate" };
    case "CURRENT":
      return { label: "Current", tone: "blue" };
    case "PRESENTED":
      return { label: "Presented", tone: "green" };
    case "SKIPPED":
      return { label: "Skipped", tone: "amber" };
    default:
      return { label: status, tone: "neutral" };
  }
}

/* ----------------------------------- Input ---------------------------------- */

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, className = "", id, ...rest },
  ref,
) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="space-y-1.5">
      {label ? (
        <label htmlFor={inputId} className="block text-sm font-medium text-ink-800">
          {label}
        </label>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        className={`h-11 w-full rounded-lg border bg-white px-3 text-[15px] text-ink-950 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-gold-500/60 ${
          error ? "border-red-400" : "border-slate-300"
        } ${className}`}
        {...rest}
      />
      {error ? <p className="text-xs text-red-700">{error}</p> : hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
});

/* ----------------------------------- Modal ---------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose?: () => void;
  title?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-ink-950/60"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className={`relative w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[90vh] overflow-auto rounded-xl border border-slate-200 bg-white shadow-2xl`}
          >
            {title ? (
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <h2 className="text-base font-semibold text-ink-900">{title}</h2>
                {onClose ? (
                  <button
                    onClick={onClose}
                    aria-label="Close dialog"
                    className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="px-5 py-4">{children}</div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

/* --------------------------------- Confirm ---------------------------------- */

export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  danger = false,
  loading = false,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div className="space-y-5">
        <div className="text-sm leading-relaxed text-slate-700">{message}</div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ----------------------------------- Toast ---------------------------------- */

export function InlineMessage({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    info: "border-sky-200 bg-sky-50 text-sky-900",
  };
  return <div className={`rounded-lg border px-3 py-2 text-sm ${styles[tone]}`}>{children}</div>;
}

/* ---------------------------------- Section ---------------------------------- */

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="space-y-0.5">
      <h1 className="font-display text-2xl tracking-tight text-ink-950">{children}</h1>
      {sub ? <p className="text-sm text-slate-500">{sub}</p> : null}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center text-slate-500">
      {children}
    </div>
  );
}
