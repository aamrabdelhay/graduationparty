import { requireAdmin } from "@/lib/auth/require-admin";
import { getDb } from "@/db";
import { participant, submission, group, imageAsset } from "@/db/schema";
import { count, eq } from "drizzle-orm";
import { jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface AdminStats {
  totalParticipants: number;
  totalGroups: number;
  individuals: number;
  groups: number; // group submissions (Submission rows of type GROUP)
  pendingAi: number;
  processingAi: number;
  failedAi: number;
  completedAi: number;
  queued: number;
  current: number;
  presented: number;
  skipped: number;
  totalImages: number;
}

export async function GET() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const db = getDb();

  const [p, g, s, img] = await Promise.all([
    db.select({ n: count() }).from(participant),
    db.select({ n: count() }).from(group),
    db.select({ type: submission.type, n: count() }).from(submission).groupBy(submission.type),
    db.select({ n: count() }).from(imageAsset).where(eq(imageAsset.committed, true)),
  ]);

  const byAi = await db
    .select({ status: participant.aiStatus, n: count() })
    .from(participant)
    .groupBy(participant.aiStatus);
  const byPs = await db
    .select({ status: participant.presentationStatus, n: count() })
    .from(participant)
    .groupBy(participant.presentationStatus);

  const val = (rows: Array<{ status: string; n: number }>, status: string) =>
    Number(rows.find((r) => r.status === status)?.n ?? 0);

  return jsonOk({
    totalParticipants: Number(p[0]?.n ?? 0),
    totalGroups: Number(g[0]?.n ?? 0),
    individuals: Number(s.find((r) => r.type === "INDIVIDUAL")?.n ?? 0),
    groups: Number(s.find((r) => r.type === "GROUP")?.n ?? 0),
    pendingAi: val(byAi, "PENDING"),
    processingAi: val(byAi, "PROCESSING"),
    failedAi: val(byAi, "FAILED"),
    completedAi: val(byAi, "COMPLETED"),
    queued: val(byPs, "QUEUED"),
    current: val(byPs, "CURRENT"),
    presented: val(byPs, "PRESENTED"),
    skipped: val(byPs, "SKIPPED"),
    totalImages: Number(img[0]?.n ?? 0),
  } satisfies AdminStats);
}
