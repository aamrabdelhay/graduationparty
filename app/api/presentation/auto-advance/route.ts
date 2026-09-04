import { z } from "zod";
import { getDb } from "@/db";
import { participant } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyDisplayToken } from "@/lib/presentation/tokens";
import { ensurePresentationState, presentationNext } from "@/lib/presentation/state";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  token: z.string().min(8).max(200),
  version: z.number().int().min(0),
});

/**
 * Automatic-mode advance request from the projector itself. Only honored when:
 *   - the display token is valid,
 *   - the presentation is in AUTOMATIC mode with autoPlay enabled,
 *   - the client's sequenceVersion matches the current server version
 *     (prevents two projector tabs from double-advancing).
 */
export async function POST(req: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return jsonError("Invalid request.", 422, "VALIDATION");
  }
  const display = await verifyDisplayToken(body.token);
  if (!display) return jsonError("This presentation link is no longer valid.", 401, "INVALID_TOKEN");

  const db = getDb();
  const state = await ensurePresentationState();
  if (state.mode !== "AUTOMATIC" || !state.autoPlay) {
    return jsonOk({ advanced: false, reason: "manual-mode" });
  }
  if ((state.sequenceVersion ?? 0) !== body.version) {
    return jsonOk({ advanced: false, reason: "stale-version" });
  }
  if (state.playback !== "RUNNING" || state.isPaused) {
    return jsonOk({ advanced: false, reason: "paused" });
  }
  const current = state.currentParticipantId
    ? (await db.select().from(participant).where(eq(participant.id, state.currentParticipantId)).limit(1))[0]
    : undefined;
  if (!current) return jsonOk({ advanced: false, reason: "no-current" });

  const result = await presentationNext();
  if (!result.ok) return jsonOk({ advanced: false, reason: "queue-end" });
  const nextState = await ensurePresentationState();
  return jsonOk({ advanced: true, version: nextState.sequenceVersion });
}
