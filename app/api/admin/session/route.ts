import { jsonOk } from "@/lib/http";
import { getAdminSession } from "@/lib/auth/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return jsonOk({ authed: false });
  }
  return jsonOk({ authed: true, sessionId: session.id, loggedInAt: session.createdAt });
}
