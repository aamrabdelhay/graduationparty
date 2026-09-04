import { getAdminSession } from "@/lib/auth/admin";
import { jsonError } from "@/lib/http";
import type { AdminSessionRow } from "@/db/schema";

/** Server helper for admin API routes. Returns session or a 401 response. */
export async function requireAdmin(): Promise<{ session: AdminSessionRow } | { error: ReturnType<typeof jsonError> }> {
  const session = await getAdminSession();
  if (!session) {
    return { error: jsonError("Unauthorized. Please sign in to the admin area.", 401, "UNAUTHORIZED") };
  }
  return { session };
}
