/**
 * Central environment configuration with safe defaults for development.
 * Real secrets are always read from process.env (never committed).
 */

const LOCAL_DEV_DB = "postgres://postgres:postgres@127.0.0.1:55432/graduation_party";

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url) return url;
  if (!isProduction()) return LOCAL_DEV_DB;
  throw new Error(
    "DATABASE_URL is not set. Copy `.env.example` to `.env.local` and configure PostgreSQL (see README).",
  );
}

export function getDirectDatabaseUrl(): string {
  return process.env.DIRECT_URL || getDatabaseUrl();
}

export function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD ?? "cu";
}

export function getAppBaseUrl(): string {
  return process.env.APP_BASE_URL ?? "";
}

export type StorageProviderName = "blob" | "disk" | "database";

export function getStorageProvider(): StorageProviderName {
  const configured = (process.env.STORAGE_PROVIDER ?? "").toLowerCase();

  // Prefer Vercel Blob in production when the integration token is available.
  // If the project has not been connected to Blob yet, use the durable Neon
  // database fallback instead of the ephemeral serverless filesystem.
  if (isProduction()) {
    if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
    if (configured === "blob" && process.env.BLOB_READ_WRITE_TOKEN) return "blob";
    return "database";
  }

  if (configured === "blob" && process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  if (configured === "database") return "database";
  if (configured === "disk") return "disk";
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  return "disk";
}

export function getBlobToken(): string {
  return process.env.BLOB_READ_WRITE_TOKEN ?? "";
}

export type AiProviderName = "openai" | "offline";

export function getAiProvider(): AiProviderName {
  const configured = (process.env.AI_PROVIDER ?? "").toLowerCase();
  if (configured === "openai") return "openai";
  if (configured === "offline") return "offline";
  return process.env.AI_API_KEY ? "openai" : "offline";
}

export function getAiApiKey(): string {
  return process.env.AI_API_KEY ?? "";
}

export function getAiModel(): string {
  return process.env.AI_MODEL ?? "gpt-image-1";
}

export function getAiImageSize(): "1024x1024" | "1536x1024" | "1024x1536" | "auto" {
  const s = (process.env.AI_IMAGE_SIZE ?? "1024x1024").toLowerCase();
  if (s === "auto" || s === "1536x1024" || s === "1024x1536") return s as never;
  return "1024x1024";
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function isDevelopment(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function getStorageDir(): string {
  return process.env.STORAGE_DIR ?? ".storage/public";
}

export function getSessionCookieSecure(): boolean {
  if (process.env.SESSION_COOKIE_SECURE !== undefined) {
    return process.env.SESSION_COOKIE_SECURE !== "false";
  }
  return isProduction();
}

export function getMaxUploadBytes(): number {
  const mb = Number(process.env.MAX_UPLOAD_MB ?? "10");
  return Math.max(1, Math.min(50, mb)) * 1024 * 1024;
}
