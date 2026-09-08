import { NextRequest } from "next/server";
import { db, ensureDbReady } from "@/db";
import { groups, participants, presentationState } from "@/db/schema";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Run the same non-destructive schema upgrade used by normal API requests and
 * return a small health snapshot. No tables or rows are dropped.
 */
export async function GET(_req: NextRequest) {
  try {
    await ensureDbReady();

    const [{ participantCount }] = await db
      .select({ participantCount: sql<number>`count(*)` })
      .from(participants);
    const [{ groupCount }] = await db
      .select({ groupCount: sql<number>`count(*)` })
      .from(groups);
    const state = await db.select().from(presentationState).limit(1);

    return Response.json({
      ok: true,
      schema: "ready",
      participantCount: Number(participantCount),
      groupCount: Number(groupCount),
      presentationStateReady: state.length > 0,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
