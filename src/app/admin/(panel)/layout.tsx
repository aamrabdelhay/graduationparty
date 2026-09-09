import type { ReactNode } from "react";
import Link from "next/link";
import { Home } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AdminPanelLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <Link
        href="/"
        aria-label="الصفحة الرئيسية"
        className="fixed left-4 top-4 z-[60] inline-flex items-center gap-2 rounded-xl border border-gold-500/30 bg-night-950/90 px-4 py-2.5 text-xs font-black text-gold-200 shadow-lg backdrop-blur-md transition-colors hover:border-gold-400/60 hover:text-gold-100"
      >
        <Home className="size-4" />
        الرئيسية
      </Link>
      {children}
    </div>
  );
}
