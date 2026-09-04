import type { Metadata } from "next";
import { z } from "zod";
import ProjectorScreen from "@/components/projector/ProjectorScreen";

export const metadata: Metadata = { title: "Graduation Presentation" };

export const dynamic = "force-dynamic";

export default async function ProjectorPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = z.string().min(8).max(200).safeParse(token).success;
  if (!valid) {
    return <InvalidScreen />;
  }
  return <ProjectorScreen token={token} />;
}

function InvalidScreen() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-ink-950 px-6 text-center text-white">
      <p className="font-display text-3xl font-semibold tracking-tight">Graduation Presentation</p>
      <p className="mt-3 text-sm text-slate-400">This presentation link is not valid.</p>
      <p className="mt-1 text-xs text-slate-600">Please ask the organizer for the current link.</p>
    </div>
  );
}
