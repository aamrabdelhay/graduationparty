import { NextRequest } from "next/server";
import { publicSnapshot, validateDisplayToken } from "@/lib/presentation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Minimal projector API. Only the currently active presentation state is
 * exposed (name + graduation image of the current participant). The full
 * participant database is never returned here.
 */
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!(await validateDisplayToken(token))) {
    return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  const snap = await publicSnapshot();
  return Response.json({ ok: true, state: snap });
}
