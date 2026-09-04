/**
 * Local-disk object storage — DEVELOPMENT/TEST ONLY.
 *
 * Files are written under `STORAGE_DIR` (default `.storage/public`) and served
 * by the app route `/storage/[...path]`. Production must use a cloud provider
 * (`STORAGE_PROVIDER=blob` with a Vercel Blob token, or an S3-compatible
 * provider added later). The schema column `storage_provider` records where
 * each asset lives so cleanup can route to the right provider.
 */
import { mkdir, writeFile, unlink, access, readFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { getStorageDir } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { ObjectStorage, PutObjectInput, StoredObject } from "./types";

export const DISK_PROVIDER = "disk";

export class DiskStorage implements ObjectStorage {
  readonly provider = DISK_PROVIDER;

  constructor(private readonly rootDir: string = getStorageDir()) {}

  private resolve(relative: string): string {
    // Prevent path traversal.
    const safe = path.normalize(relative).replace(/^(\.\.(\/|\\|$))+/, "");
    return path.join(this.rootDir, safe);
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    const name = `${Date.now().toString(36)}-${randomBytes(6).toString("hex")}.${input.extension.replace(/[^a-z0-9]/gi, "")}`;
    const relative = path.posix.join(input.folder, name);
    const abs = this.resolve(relative);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, input.data);
    return { key: relative, url: `/storage/${relative}`, provider: DISK_PROVIDER };
  }

  async delete(keyOrUrl: string): Promise<void> {
    const relative = keyOrUrl.startsWith("/storage/")
      ? keyOrUrl.slice("/storage/".length)
      : keyOrUrl;
    try {
      await access(this.resolve(relative));
      await unlink(this.resolve(relative));
    } catch {
      // Missing file is fine — idempotent cleanup.
    }
  }

  /** True when the underlying file exists (used by cleanup verification). */
  async exists(key: string): Promise<boolean> {
    try {
      await access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async get(keyOrUrl: string): Promise<Buffer> {
    const relative = keyOrUrl.startsWith("/storage/")
      ? keyOrUrl.slice("/storage/".length)
      : keyOrUrl;
    return readFile(this.resolve(relative));
  }
}

export function logDiskWarning() {
  if (process.env.STORAGE_PROVIDER && process.env.STORAGE_PROVIDER !== "disk") return;
  logger.warn(
    "Image storage is using the LOCAL DISK provider. This is only suitable for development/tests — set STORAGE_PROVIDER=blob + BLOB_READ_WRITE_TOKEN in production.",
  );
}
