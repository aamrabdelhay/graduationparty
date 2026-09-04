import { getDb } from "@/db";
import { activityLog } from "@/db/schema";
import { logger } from "@/lib/logger";

export interface LogActivityInput {
  action: string;
  participantId?: string | null;
  adminSessionId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Append an activity log row. Best-effort: never throws into request paths. */
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    await getDb()
      .insert(activityLog)
      .values({
        action: input.action,
        participantId: input.participantId ?? null,
        adminSessionId: input.adminSessionId ?? null,
        metadata: input.metadata ?? {},
      });
  } catch (err) {
    logger.error("activity log write failed", { error: (err as Error).message });
  }
}

export async function recentActivity(limit = 15) {
  return getDb().select().from(activityLog).orderBy(activityLog.id).limit(limit);
}
