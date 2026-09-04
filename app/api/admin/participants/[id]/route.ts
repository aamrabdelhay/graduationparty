import { requireAdmin } from "@/lib/auth/require-admin";
import { getParticipantView } from "@/db/views";
import { jsonOk, jsonError } from "@/lib/http";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return jsonError("Invalid participant id.", 400);
  const view = await getParticipantView(id);
  if (!view) return jsonError("Participant not found.", 404, "NOT_FOUND");
  return jsonOk({ participant: view });
}
