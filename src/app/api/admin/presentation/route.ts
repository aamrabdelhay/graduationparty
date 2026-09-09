import { NextRequest } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import {
  applyAction,
  PresentationAction,
  publicSnapshot,
} from "@/lib/presentation";

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

type DatabaseErrorLike = Error & {
  code?: string;
  detail?: string;
  hint?: string;
  constraint?: string;
  table?: string;
  column?: string;
  schema?: string;
  routine?: string;
  severity?: string;
  where?: string;
  cause?: unknown;
};

function serializeError(error: unknown, depth = 0): Record<string, unknown> {
  const e = error as DatabaseErrorLike;
  const cause = depth < 3 && e?.cause ? serializeError(e.cause, depth + 1) : null;
  return {
    message: e instanceof Error ? e.message : String(e),
    code: e.code ?? null,
    detail: e.detail ?? null,
    hint: e.hint ?? null,
    constraint: e.constraint ?? null,
    table: e.table ?? null,
    column: e.column ?? null,
    schema: e.schema ?? null,
    routine: e.routine ?? null,
    severity: e.severity ?? null,
    where: e.where ?? null,
    cause,
  };
}

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
      return Response.json(
        { ok: false, error: "أمر غير معروف" },
        { status: 400 },
      );
    }

    const { action, ...payload } = body;
    const snapshot = await applyAction(action, payload);
    return Response.json({ ok: true, state: snapshot });
  } catch (error) {
    const details = serializeError(error);
    const errorText = JSON.stringify(details);
    console.error("Presentation action failed:", errorText);
    return Response.json(
      {
        ok: false,
        error: details.message,
        database: details,
      },
      { status: 400 },
    );
  }
}
