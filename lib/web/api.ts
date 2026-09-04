"use client";

/** Thin typed fetch client for the browser side. */

export class ApiError extends Error {
  status: number;
  code?: string;
  body?: unknown;
  constructor(message: string, status: number, code?: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: "same-origin",
      ...init,
      headers: { ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...init?.headers },
    });
  } catch {
    throw new ApiError("Network error. Please check your connection and try again.", 0, "NETWORK");
  }
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  if (!res.ok) {
    const errBody = (json ?? {}) as { error?: string; code?: string; details?: unknown };
    const message =
      errBody.error ??
      (res.status === 401 ? "You are not signed in." : res.status === 403 ? "You do not have permission." : "Something went wrong. Please try again.");
    throw new ApiError(message, res.status, errBody.code ?? `HTTP_${res.status}`, errBody.details);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: async <T>(path: string, file: File, kind: string): Promise<T> => {
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind);
    return request<T>(path, { method: "POST", body: form });
  },
};
