import type { Metadata } from "next";
import ParticipantDetail from "@/components/admin/ParticipantDetail";

export const metadata: Metadata = { title: "Participant" };

export default async function ParticipantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ParticipantDetail id={id} />;
}
