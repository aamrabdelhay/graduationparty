import { createHash, randomBytes } from "node:crypto";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Secure random URL-safe token (default 24 bytes => 32 URL-safe chars). */
export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

/** Random uuid v4 string (for draft ids etc. when DB default isn't used). */
export function randomUuid(): string {
  return randomBytes(16).toString("hex");
}
