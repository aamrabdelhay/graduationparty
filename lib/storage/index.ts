import { getStorageProvider } from "@/lib/env";
import { DiskStorage, DISK_PROVIDER } from "./disk";
import { BlobStorage, BLOB_PROVIDER } from "./blob";
import type { ObjectStorage } from "./types";

export type { ObjectStorage, StoredObject, PutObjectInput } from "./types";
export { DISK_PROVIDER, BLOB_PROVIDER };

let cached: ObjectStorage | null = null;

export function getStorage(): ObjectStorage {
  if (cached) return cached;
  const provider = getStorageProvider();
  cached = provider === "blob" ? new BlobStorage() : new DiskStorage();
  return cached;
}

export async function deleteStoredObject(key: string, provider?: string | null): Promise<void> {
  const normalized = provider === BLOB_PROVIDER ? new BlobStorage() : new DiskStorage();
  await normalized.delete(key);
}
