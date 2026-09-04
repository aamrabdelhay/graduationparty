import { Suspense } from "react";
import Wizard from "@/components/public/Wizard";

export const metadata = {
  title: "Add yourself",
};

export const dynamic = "force-dynamic";

export default function AddPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[80vh] items-center justify-center text-slate-400">Loading…</div>}>
      <Wizard />
    </Suspense>
  );
}
