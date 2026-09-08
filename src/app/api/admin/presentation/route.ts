import { NextRequest } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { applyAction, PresentationAction, publicSnapshot } from "@/lib/presentation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS: PresentationAction[] = [
  "start",
  "pause",
  "resume",
  "next",
  "previous",
  "skip",
  "restart",
  "replay",
  "jump",
  "timings",
  "mode",
  "stop",
];

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ ok: false }, { status: 401 });
  return Response.json({ ok: true, state: await publicSnapshot() });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ ok: false }, { status: 401 });

  try {
    const body = (await req.json()) as {
      action?: PresentationAction;
      [key: string]: unknown;
    };
    if (!body.action || !ACTIONS.includes(body.action)) {
      return Response.json({ ok: false, error: "أمر غير معروف" }, { status: 400 });
    }
    const { action, ...payload } = body;
    const snapshot = await applyAction(action, payload);
    return Response.json({ ok: true, state: snapshot });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "خطأ" },
      { status: 400 },
    );
  }
}
