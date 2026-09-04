/**
 * Object-storage abstraction. The application never talks to a concrete
 * provider directly; swapping Vercel Blob for S3 (or any S3-compatible
 * bucket) later only requires a new provider implementation + wiring.
 */

export interface StoredObject {
  /** Provider-local identifier used for deletion/lookups. */
  key: string;
  /** Publicly fetchable URL (absolute http(s) or app-relative). */
  url: string;
  provider: string;
}

export interface PutObjectInput {
  /** Logical path prefix, e.g. "childhood" | "adult" | "graduation". */
  folder: string;
  /** File extension without dot, e.g. "jpg" | "png". */
  extension: string;
  /** Raw file bytes. */
  data: Buffer;
  contentType: string;
}

export interface ObjectStorage {
  put(input: PutObjectInput): Promise<StoredObject>;
  delete(keyOrUrl: string): Promise<void>;
  /** Read back object bytes (used by image processing pipelines). */
  get(keyOrUrl: string): Promise<Buffer>;
}
