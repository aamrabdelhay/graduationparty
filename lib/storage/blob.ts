/**
 * Vercel Blob object storage (production default when a token is present).
 */
import { del, put } from "@vercel/blob";
import { getBlobToken } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { ObjectStorage, PutObjectInput, StoredObject } from "./types";

export const BLOB_PROVIDER = "blob";

export class BlobStorage implements ObjectStorage {
  readonly provider = BLOB_PROVIDER;

  constructor() {
    if (!getBlobToken()) {
      throw new Error(
        "STORAGE_PROVIDER=blob requires BLOB_READ_WRITE_TOKEN. Add the token or switch STORAGE_PROVIDER=disk for local development.",
      );
    }
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    const pathname = `graduation/${input.folder}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.${input.extension}`;
    const result = await put(pathname, input.data, {
      access: "public",
      contentType: input.contentType,
      addRandomSuffix: false,
      cacheControlMaxAge: 60 * 60 * 24 * 365,
      token: getBlobToken(),
    });
    return { key: result.pathname, url: result.url, provider: BLOB_PROVIDER };
  }

  async delete(keyOrUrl: string): Promise<void> {
    try {
      const url = keyOrUrl.startsWith("http") ? keyOrUrl : undefined;
      await del(url ?? keyOrUrl, { token: getBlobToken() });
    } catch (err) {
      logger.warn("blob delete failed (continuing)", { error: (err as Error).message });
    }
  }

  async get(keyOrUrl: string): Promise<Buffer> {
    const url = keyOrUrl.startsWith("http")
      ? keyOrUrl
      : `https://${process.env.BLOB_URL ?? "store.vercel-blob.com"}/${keyOrUrl}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${getBlobToken()}` } });
    if (!res.ok) throw new Error(`blob get failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
}
