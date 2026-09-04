import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { jsonError, jsonOk } from "@/lib/http";
import {
  getControlRoomSnapshot,
  presentationStart,
  presentationPause,
  presentationResume,
  presentationNext,
  presentationPrevious,
  presentationReplay,
  presentationSkip,
  presentationJump,
  presentationRestartQueue,
} from "@/lib/presentation/state";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — full control-room snapshot. */
export async function GET() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const snapshot = await getControlRoomSnapshot();
  return jsonOk(snapshot);
}

const commandSchema = z.object({
  command: z.enum(["start", "pause", "resume", "next", "previous", "replay", "skip", "jump", "restart"]),
  participantId: z.string().uuid().optional(),
});

/** POST — presentation control command (start/pause/resume/next/prev/replay/skip/jump/restart). */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  let body: z.infer<typeof commandSchema>;
  try {
    body = commandSchema.parse(await req.json());
  } catch {
    return jsonError("Invalid command.", 422, "VALIDATION");
  }

  let result;
  switch (body.command) {
    case "start":
      result = await presentationStart();
      break;
    case "pause":
      result = await presentationPause();
      break;
    case "resume":
      result = await presentationResume();
      break;
    case "next":
      result = await presentationNext();
      break;
    case "previous":
      result = await presentationPrevious();
      break;
    case "replay":
      result = await presentationReplay();
      break;
    case "skip":
      result = await presentationSkip();
      break;
    case "jump":
      if (!body.participantId) return jsonError("participantId required.", 422);
      result = await presentationJump(body.participantId);
      break;
    case "restart":
      result = await presentationRestartQueue();
      break;
  }
  if (!result.ok) {
    return jsonError(result.message === "no_queue" || result.message === "no_current"
      ? "There is nothing to present yet."
      : result.message === "at_start"
        ? "Already at the beginning of the queue."
        : result.message === "already_idle"
          ? "The presentation is already idle."
          : "Could not update the presentation.",
    result.message === "queue_end" ? 200 : 409,
    "COMMAND_FAILED");
  }
  await logActivity({
    action: `presentation_${body.command}`,
    adminSessionId: guard.session.id,
    metadata: { participantId: body.participantId ?? null },
  });
  const snapshot = await getControlRoomSnapshot();
  return jsonOk({ ok: true, snapshot, message: result.message });
}
