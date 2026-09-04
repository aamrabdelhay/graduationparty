import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getStorageDir, getStorageProvider } from "@/lib/env";

const ALLOWED = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);

/**
 * Serves locally-stored images for the development disk provider.
 * In production (STORAGE_PROVIDER=blob / S3) images are served by the cloud
 * provider directly and this route is never hit.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  if (getStorageProvider() !== "disk") {
    return new NextResponse("Not found", { status: 404 });
  }
  const { path: segments } = await ctx.params;
  const filePath = segments.join("/");
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (!ALLOWED.has(ext)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const root = path.resolve(getStorageDir());
  const abs = path.resolve(root, filePath);
  if (!abs.startsWith(root)) {
    return new NextResponse("Not found", { status: 404 });
  }
  try {
    const data = await readFile(abs);
    const mime =
      ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "webp"
          ? "image/webp"
          : ext === "png"
            ? "image/png"
            : ext === "avif"
              ? "image/avif"
              : "image/gif";
    return new NextResponse(data, {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(data.length),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
