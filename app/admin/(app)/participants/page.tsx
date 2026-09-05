import type { Metadata } from "next";
import { Suspense } from "react";
import ParticipantsView from "@/components/admin/ParticipantsView";

export const metadata: Metadata = { title: "الخريجون" };

export default function ParticipantsPage() {
  return <Suspense fallback={<div className="skeleton h-96 rounded-xl" />}><ParticipantsView /></Suspense>;
}
