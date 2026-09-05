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
import { ensurePresentationQueue } from "@/lib/presentation/bootstrap";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  await ensurePresentationQueue();
  return jsonOk(await getControlRoomSnapshot());
}

const commandSchema = z.object({
  command: z.enum(["start", "pause", "resume", "next", "previous", "replay", "skip", "jump", "restart"]),
  participantId: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  await ensurePresentationQueue();

  let body: z.infer<typeof commandSchema>;
  try {
    body = commandSchema.parse(await req.json());
  } catch {
    return jsonError("Invalid command.", 422, "VALIDATION");
  }

  let result;
  switch (body.command) {
    case "start": result = await presentationStart(); break;
    case "pause": result = await presentationPause(); break;
    case "resume": result = await presentationResume(); break;
    case "next": result = await presentationNext(); break;
    case "previous": result = await presentationPrevious(); break;
    case "replay": result = await presentationReplay(); break;
    case "skip": result = await presentationSkip(); break;
    case "jump":
      if (!body.participantId) return jsonError("participantId required.", 422);
      result = await presentationJump(body.participantId);
      break;
    case "restart": result = await presentationRestartQueue(); break;
  }

  if (!result.ok) {
    const message = result.message === "no_queue" || result.message === "no_current"
      ? "لا يوجد خريج جاهز للعرض."
      : result.message === "at_start"
        ? "أنت بالفعل عند بداية القائمة."
        : result.message === "already_idle"
          ? "العرض متوقف بالفعل."
          : "تعذر تحديث العرض.";
    return jsonError(message, result.message === "queue_end" ? 200 : 409, "COMMAND_FAILED");
  }

  await logActivity({
    action: `presentation_${body.command}`,
    adminSessionId: guard.session.id,
    metadata: { participantId: body.participantId ?? null },
  });
  return jsonOk({ ok: true, snapshot: await getControlRoomSnapshot(), message: result.message });
}
