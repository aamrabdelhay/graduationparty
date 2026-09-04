import { isAdminAuthed } from "@/lib/auth/admin";
import { handleUploadRequest } from "@/lib/server/api-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public image upload (CHILDHOOD/ADULT). Admins may also upload GRADUATION. */
export async function POST(req: Request) {
  const isAdmin = await isAdminAuthed();
  return handleUploadRequest(req, { allowGraduation: isAdmin });
}
