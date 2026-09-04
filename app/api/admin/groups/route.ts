import { requireAdmin } from "@/lib/auth/require-admin";
import { listGroupViews } from "@/db/views";
import { jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const groups = await listGroupViews();
  return jsonOk({ groups });
}
