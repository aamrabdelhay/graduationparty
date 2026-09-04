import { z } from "zod";
import { getAdminSession } from "@/lib/auth/admin";
import { verifyDisplayToken } from "@/lib/presentation/tokens";
import { ensurePresentationState } from "@/lib/presentation/state";
import { subscribePresentation } from "@/lib/realtime/bus";
import { ensureRealtimeListener } from "@/lib/realtime/listener";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream used by the admin control room (cookie auth) and
 * the public projector (random display token). Clients re-fetch the relevant
 * snapshot when an event announces a new sequenceVersion.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  let authorized = false;
  if (token) {
    const display = await verifyDisplayToken(token);
    authorized = Boolean(display);
  } else {
    const session = await getAdminSession();
    authorized = Boolean(session);
  }
  if (!authorized) {
    return new Response("Unauthorized", { status: 401 });
  }

  const state = await ensurePresentationState().catch(() => null);
  const hello = {
    type: "presentation",
    version: state?.sequenceVersion ?? 0,
    playback: state?.playback ?? "IDLE",
    isPaused: state?.isPaused ?? true,
    mode: state?.mode ?? "AUTOMATIC",
    currentParticipantId: state?.currentParticipantId ?? null,
  };

  // Best-effort cross-instance listener (never blocks the stream).
  ensureRealtimeListener().catch(() => undefined);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          /* stream closed */
        }
      };

      send({ ...hello, event: "snapshot" });

      const unsubscribe = subscribePresentation((evt) => {
        send({ event: "update", type: evt.type, version: evt.version, action: evt.action, at: evt.at });
      });

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keep-alive\n\n`));
        } catch {
          /* ignore */
        }
      }, 25_000);

      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export function verifyTokenParam(input: unknown) {
  return z.string().safeParse(input).success;
}
