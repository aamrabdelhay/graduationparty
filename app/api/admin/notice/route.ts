import { requireAdmin } from "@/lib/auth/require-admin";
import { consumeLatestNotice } from "@/lib/notices";
import { jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Fetch (and consume) the one-shot reminder for the previous session. */
export async function GET() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const notice = await consumeLatestNotice();
  return jsonOk({ notice });
}
