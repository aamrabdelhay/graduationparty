import { requireAdmin } from "@/lib/auth/require-admin";
import { listParticipantItems } from "@/db/views";
import { createSubmission } from "@/lib/submissions/service";
import { adminParticipantCreateSchema } from "@/lib/validation";
import { jsonError, jsonOk, handleError } from "@/lib/http";
import { logActivity } from "@/lib/activity";
import { z } from "zod";
import type { ParticipantListItem } from "@/db/views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FilterName =
  | "all"
  | "individuals"
  | "groups"
  | "pending"
  | "completed"
  | "failed"
  | "queued"
  | "presented"
  | "skipped";

const filters: Record<FilterName, (p: ParticipantListItem) => boolean> = {
  all: () => true,
  individuals: (p) => p.submissionType === "INDIVIDUAL",
  groups: (p) => p.submissionType === "GROUP",
  pending: (p) => p.aiStatus === "PENDING",
  completed: (p) => p.aiStatus === "COMPLETED",
  failed: (p) => p.aiStatus === "FAILED",
  queued: (p) => p.presentationStatus === "QUEUED",
  presented: (p) => p.presentationStatus === "PRESENTED",
  skipped: (p) => p.presentationStatus === "SKIPPED",
};

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;

  const url = new URL(req.url);
  const search = (url.searchParams.get("search") ?? "").trim();
  const filterRaw = url.searchParams.get("filter") ?? "all";
  const filter = (Object.prototype.hasOwnProperty.call(filters, filterRaw) ? filterRaw : "all") as FilterName;

  const items = await listParticipantItems(search ? { search } : undefined);
  const filtered = filter === "all" && !search ? items : items.filter(filters[filter]);
  return jsonOk({ items: filtered, total: items.length, filter });
}

const createSchema = z.object({
  participants: z.array(adminParticipantCreateSchema).min(1).max(60),
});

/** Admin manual participant creation (uses the same data flow as submissions). */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch {
    return jsonError("Please check the participant information.", 422, "VALIDATION");
  }
  try {
    const result = await createSubmission({
      type: body.participants.length === 1 ? "INDIVIDUAL" : "GROUP",
      participants: body.participants.map((p) => ({
        fullName: p.fullName,
        childhoodImageId: p.childhoodImageId,
        adultImageId: p.adultImageId,
        graduationImageId: p.graduationImageId ?? null,
      })),
      source: "ADMIN",
    });
    await logActivity({
      action: "participant_added_admin",
      adminSessionId: guard.session.id,
      metadata: { submissionId: result.submissionId, count: body.participants.length },
    });
    return jsonOk(result, { status: 201 });
  } catch (err) {
    const message = (err as Error).message;
    if (/no longer exists|already been used|Wrong photo kind/i.test(message)) {
      return jsonError(message, 409, "ASSET_CONFLICT");
    }
    return handleError(err, "Could not add the participant.");
  }
}
