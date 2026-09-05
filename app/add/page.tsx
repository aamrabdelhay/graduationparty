import { Suspense } from "react";
import Wizard from "@/components/public/Wizard";

export const metadata = { title: "إضافة الصور والذكريات" };
export const dynamic = "force-dynamic";

export default function AddPage() {
  return <Suspense fallback={<div className="capital-page flex min-h-[80vh] items-center justify-center text-slate-400">جارٍ التحميل…</div>}><Wizard /></Suspense>;
}
