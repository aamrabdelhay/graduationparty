/**
 * Shared validation schemas (Zod). Client + server use the same rules so
 * messages are consistent. Full names support Arabic & Latin scripts.
 */
import { z } from "zod";

// Letters (any script incl. Arabic), spaces, hyphen, apostrophe, dot.
const nameRegex = /^[\p{L}\p{M}][\p{L}\p{M}\s'’.\-()]+$/u;

export const fullNameSchema = z
  .string({ required_error: "Please enter the participant's full name." })
  .trim()
  .min(2, "Please enter the full name (at least 2 characters).")
  .max(120, "The name is too long (120 characters max).")
  .refine((v) => nameRegex.test(v), {
    message: "The name can only contain letters, spaces and simple punctuation.",
  });

export function normalizeName(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export const uuidSchema = z.string().uuid("Invalid identifier.");

export const aiStatusSchema = z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED"]);

export const participantDraftInputSchema = z.object({
  fullName: fullNameSchema,
  childhoodImageId: uuidSchema,
  adultImageId: uuidSchema,
  graduationImageId: uuidSchema.optional().nullable(),
});

export const submissionPayloadSchema = z
  .object({
    type: z.enum(["INDIVIDUAL", "GROUP"]),
    participants: z
      .array(participantDraftInputSchema)
      .min(1, "At least one participant is required.")
      .max(60, "A maximum of 60 participants per submission."),
  })
  .refine((v) => (v.type === "INDIVIDUAL" ? v.participants.length === 1 : true), {
    message: "Individual submissions must contain exactly one participant.",
    path: ["participants"],
  });

export const adminParticipantCreateSchema = z.object({
  fullName: fullNameSchema,
  childhoodImageId: uuidSchema,
  adultImageId: uuidSchema,
  graduationImageId: uuidSchema.optional().nullable(),
});

export type SubmissionPayload = z.infer<typeof submissionPayloadSchema>;
