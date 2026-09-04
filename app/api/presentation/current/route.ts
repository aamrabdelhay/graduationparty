import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { participant, presentationState, imageAsset } from "@/db/schema";
import { ensurePresentationState, settingsFromState } from "@/lib/presentation/state";
import { verifyDisplayToken } from "@/lib/presentation/tokens";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({ token: z.string().min(8).max(200).optional() });

/**
 * Public projector payload — the ONLY presentation endpoint the projector uses.
 * It returns data for the current slide only (never the participant database),
 * gated by the random display token.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ token: url.searchParams.get("token") ?? undefined });
  if (!parsed.success) return jsonError("Invalid presentation link.", 400);
  const token = parsed.data.token;
  if (!token) return jsonError("A presentation link is required.", 401, "TOKEN_REQUIRED");
  const display = await verifyDisplayToken(token);
  if (!display) return jsonError("This presentation link is no longer valid.", 401, "INVALID_TOKEN");

  const db = getDb();
  const state = await ensurePresentationState();
  const settings = settingsFromState(state);

  if (state.playback === "FINISHED") {
    return jsonOk({
      status: "finished",
      playback: state.playback,
      isPaused: state.isPaused,
      mode: state.mode,
      sequenceVersion: state.sequenceVersion,
      durations: {
        childhoodDurationMs: settings.childhoodDurationMs,
        smokeDurationMs: settings.smokeDurationMs,
        adultDurationMs: settings.adultDurationMs,
        nameRevealDurationMs: settings.nameRevealDurationMs,
        transitionDurationMs: settings.transitionDurationMs,
      },
      display: settings.displaySettings,
    });
  }
  if (state.playback === "IDLE" || !state.currentParticipantId) {
    return jsonOk({
      status: "waiting",
      playback: state.playback,
      isPaused: state.isPaused,
      mode: state.mode,
      sequenceVersion: state.sequenceVersion,
      durations: {
        childhoodDurationMs: settings.childhoodDurationMs,
        smokeDurationMs: settings.smokeDurationMs,
        adultDurationMs: settings.adultDurationMs,
        nameRevealDurationMs: settings.nameRevealDurationMs,
        transitionDurationMs: settings.transitionDurationMs,
      },
      display: settings.displaySettings,
    });
  }

  const p = (await db.select().from(participant).where(eq(participant.id, state.currentParticipantId)).limit(1))[0];
  if (!p) {
    return jsonOk({ status: "waiting", sequenceVersion: state.sequenceVersion, playback: state.playback });
  }
  const assetIds = [p.childhoodImageId, p.adultImageId, p.graduationImageId].filter(Boolean) as string[];
  const assets = (
    await Promise.all(assetIds.map(async (id) => (await db.select().from(imageAsset).where(eq(imageAsset.id, id)).limit(1))[0]))
  ).filter((a): a is NonNullable<typeof a> => Boolean(a));
  const urlFor = new Map(assets.map((a) => [a.id, a.publicUrl]));

  return jsonOk({
    status: "ok",
    participantId: p.id,
    name: p.fullName,
    childhoodImageUrl: urlFor.get(p.childhoodImageId) ?? null,
    adultImageUrl: urlFor.get(p.adultImageId) ?? null,
    graduationImageUrl: p.graduationImageId ? (urlFor.get(p.graduationImageId) ?? null) : null,
    aiStatus: p.aiStatus,
    playback: state.playback,
    isPaused: state.isPaused,
    mode: state.mode,
    loopAfterQueueEnd: state.loopAfterQueueEnd,
    sequenceVersion: state.sequenceVersion,
    durations: {
      childhoodDurationMs: settings.childhoodDurationMs,
      smokeDurationMs: settings.smokeDurationMs,
      adultDurationMs: settings.adultDurationMs,
      nameRevealDurationMs: settings.nameRevealDurationMs,
      transitionDurationMs: settings.transitionDurationMs,
    },
    display: settings.displaySettings,
  });
}
