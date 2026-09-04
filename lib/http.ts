import { NextResponse } from "next/server";

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, { status: init?.status ?? 200, ...init });
}

export interface ApiErrorBody {
  error: string;
  code?: string;
  details?: unknown;
}

export function jsonError(message: string, status = 400, code?: string, details?: unknown): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: message, ...(code ? { code } : {}), ...(details !== undefined ? { details } : {}) } satisfies ApiErrorBody, { status });
}

/** Normalize thrown errors into user-friendly JSON (never leak stack traces). */
export function handleError(err: unknown, fallback = "Something went wrong. Please try again."): NextResponse {
  const e = err as { name?: string; code?: string; message?: string };
  if (e?.name === "ImageValidationError") {
    return jsonError(e.message ?? "Please upload a valid image.", 422, e.code);
  }
  if (e?.name === "ZodError") {
    const first = (e as { issues?: Array<{ message?: string }> }).issues?.[0]?.message;
    return jsonError(first ?? "Please check the information you entered.", 422, "VALIDATION");
  }
  if (e?.name === "CapGenerationError") {
    return jsonError(e.message ?? "Graduation cap generation failed. You can retry.", 502, "AI_FAILED");
  }
  return jsonError(fallback, 500, "INTERNAL");
}
