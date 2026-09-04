"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { DraftProvider, useDraftContext } from "@/components/admin/DraftProvider";
import { Button, ConfirmDialog, Modal, Spinner } from "@/components/ui";
import { api } from "@/lib/web/api";

const NAV = [
  { href: "/admin", label: "Dashboard", match: /^\/admin$/ },
  { href: "/admin/participants", label: "Participants", match: /^\/admin\/participants/ },
  { href: "/admin/groups", label: "Groups", match: /^\/admin\/groups/ },
  { href: "/admin/presentation", label: "Presentation", match: /^\/admin\/presentation/ },
  { href: "/admin/settings", label: "Settings", match: /^\/admin\/settings/ },
];

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { summary, save, discard, busy } = useDraftContext();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const unsavedCount = summary?.changeCount ?? 0;

  async function doLogout() {
    setLogoutBusy(true);
    try {
      await api.post("/api/admin/logout", { discardUnsaved: false });
      router.replace("/admin/login");
    } catch (err) {
      // Should not happen — drafts were handled first.
      await api.post("/api/admin/logout", { discardUnsaved: true });
      router.replace("/admin/login");
    } finally {
      setLogoutBusy(false);
    }
  }

  async function saveAndLogout() {
    setLogoutBusy(true);
    const { ok } = await save();
    if (ok) {
      try {
        await api.post("/api/admin/logout", { discardUnsaved: false });
      } catch {
        await api.post("/api/admin/logout", { discardUnsaved: true });
      }
      router.replace("/admin/login");
    } else {
      setLogoutBusy(false);
    }
  }

  async function logoutWithoutSaving() {
    setLogoutBusy(true);
    await discard(true);
    try {
      await api.post("/api/admin/logout", { discardUnsaved: false });
    } catch {
      await api.post("/api/admin/logout", { discardUnsaved: true });
    }
    router.replace("/admin/login");
    setLogoutBusy(false);
  }

  const openLogout = () => {
    if (unsavedCount === 0) {
      void doLogout();
    } else {
      setLogoutOpen(true);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-100/60">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-6 px-4 sm:px-6">
          <Link href="/admin" className="flex items-baseline gap-2 whitespace-nowrap">
            <span className="font-display text-lg font-semibold tracking-tight text-ink-950">Graduation Party</span>
            <span className="rounded bg-ink-900 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold-400">
              Admin
            </span>
          </Link>
          <nav aria-label="Admin" className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => {
              const active = item.match.test(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    active ? "bg-cream-100 text-ink-950" : "text-slate-600 hover:bg-slate-100 hover:text-ink-950"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/"
              target="_blank"
              rel="noreferrer"
              className="hidden rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 sm:block"
            >
              Public site ↗
            </Link>
            <button
              onClick={openLogout}
              disabled={busy || logoutBusy}
              className="flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
            >
              {logoutBusy ? <Spinner className="h-3.5 w-3.5 border-2" /> : null}
              Log out
            </button>
          </div>
        </div>
        {/* Mobile nav */}
        <nav aria-label="Admin (compact)" className="flex gap-1 overflow-x-auto border-t border-slate-100 px-3 py-1.5 md:hidden">
          {NAV.map((item) => {
            const active = item.match.test(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium ${
                  active ? "bg-cream-100 text-ink-950" : "text-slate-600"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">{children}</div>

      {/* Unsaved changes bar */}
      {unsavedCount > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gold-600/40 bg-ink-950 text-white shadow-[0_-4px_20px_rgba(0,0,0,0.15)]">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
            <p className="text-sm font-medium">
              You have <span className="font-bold text-gold-400">{unsavedCount}</span> unsaved{" "}
              {unsavedCount === 1 ? "change" : "changes"}.
            </p>
            <div className="ml-auto flex items-center gap-2">
              {busy ? <Spinner className="h-4 w-4 border-2" /> : null}
              <Button variant="ghost" size="sm" className="text-white hover:bg-white/10" onClick={() => void discard(false)} disabled={busy}>
                Discard Changes
              </Button>
              <Button variant="gold" size="sm" onClick={() => void save()} disabled={busy} loading={busy}>
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Logout confirmation modal */}
      <Modal open={logoutOpen} onClose={() => setLogoutOpen(false)} title="Unsaved changes">
        <p className="text-sm leading-relaxed text-slate-700">
          You have <strong>{unsavedCount} unsaved {unsavedCount === 1 ? "change" : "changes"}</strong>. Are you sure you want to log out?
        </p>
        <div className="mt-5 space-y-2">
          <Button className="w-full justify-center" onClick={() => void saveAndLogout()} loading={logoutBusy} disabled={busy}>
            Save & Logout
          </Button>
          <Button variant="secondary" className="w-full justify-center" onClick={() => void logoutWithoutSaving()} loading={logoutBusy}>
            Logout without saving
          </Button>
          <Button variant="ghost" className="w-full justify-center" onClick={() => setLogoutOpen(false)} disabled={logoutBusy}>
            Cancel
          </Button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Logging out without saving keeps a record so you will be reminded next time you sign in.
        </p>
      </Modal>
    </div>
  );
}

export default function AdminChrome({ children }: { children: ReactNode }) {
  return (
    <DraftProvider>
      <Shell>{children}</Shell>
    </DraftProvider>
  );
}
