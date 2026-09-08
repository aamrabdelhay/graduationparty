import { NextRequest } from "next/server";
import { bus, publicSnapshot, validateDisplayToken } from "@/lib/presentation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Real-time projector channel (Server-Sent Events, serverless compatible).
 * Requires a valid, revocable display token.
 */
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!(await validateDisplayToken(token))) {
    return new Response("Forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          /* client gone */
        }
      };

      send(await publicSnapshot());
      const listener = (snap: unknown) => send(snap);
      bus.on("presentation", listener);

      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          /* noop */
        }
      }, 15000);

      req.signal.addEventListener("abort", () => {
        clearInterval(ping);
        bus.off("presentation", listener);
        try {
          controller.close();
        } catch {
          /* noop */
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
