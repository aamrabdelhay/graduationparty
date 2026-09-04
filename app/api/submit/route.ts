import { createSubmission } from "@/lib/submissions/service";
import { submissionPayloadSchema } from "@/lib/validation";
import { jsonError, jsonOk, handleError } from "@/lib/http";
import { logActivity } from "@/lib/activity";
import { createSlidingWindowLimiter } from "@/lib/rate-limit-memory";
import { clientIpFromHeaders } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const submitLimiter = createSlidingWindowLimiter(60 * 60 * 1000, 10);

/** Final public submission. Server-side validation + authoritative timestamp. */
export async function POST(req: Request) {
  const ip = clientIpFromHeaders(req.headers);
  const rate = submitLimiter.check(ip);
  if (!rate.allowed) {
    return jsonError("Too many submissions from this device. Please try again later.", 429, "RATE_LIMITED");
  }
  let payload;
  try {
    payload = submissionPayloadSchema.parse(await req.json());
  } catch (err) {
    return handleError(err, "Please check the information you entered.");
  }
  try {
    const result = await createSubmission({
      type: payload.type,
      participants: payload.participants.map((p) => ({
        fullName: p.fullName,
        childhoodImageId: p.childhoodImageId,
        adultImageId: p.adultImageId,
        graduationImageId: p.graduationImageId ?? null,
      })),
      source: "PUBLIC",
    });
    await logActivity({
      action: payload.type === "GROUP" ? "group_submitted" : "participant_submitted",
      metadata: {
        submissionId: result.submissionId,
        count: payload.participants.length,
        groupId: result.groupId,
      },
    });
    return jsonOk({
      submissionId: result.submissionId,
      submittedAt: result.submittedAt.toISOString(),
      participantIds: result.participantIds,
      groupId: result.groupId,
      groupNumber: result.groupNumber,
    });
  } catch (err) {
    const message = (err as Error).message;
    if (/no longer exists|already been used|Wrong photo kind/i.test(message)) {
      return jsonError(message, 409, "ASSET_CONFLICT");
    }
    return handleError(err, "We could not save your submission. Please try again.");
  }
}
