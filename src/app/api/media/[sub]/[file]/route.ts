import { NextRequest } from "next/server";
import path from "path";
import fs from "fs/promises";
import { uploadsRoot } from "@/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streams locally-stored uploaded images (object-storage URLs bypass this
 * route entirely). Path traversal is rejected; only JPEG images are served
 * (the pipeline normalizes everything to JPEG).
 */
const ROOT = uploadsRoot();

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sub: string; file: string }> },
) {
  try {
    const { sub, file } = await params;
    const clean = [sub, file].map((s) => decodeURIComponent(s));
    for (const seg of clean) {
      if (
        !seg ||
        seg === "." ||
        seg === ".." ||
        seg.includes("/") ||
        seg.includes("\\") ||
        seg.includes(String.fromCharCode(0))
      ) {
        return new Response("Not found", { status: 404 });
      }
    }
    const full = path.join(ROOT, ...clean);
    if (!full.startsWith(ROOT + path.sep)) {
      return new Response("Not found", { status: 404 });
    }
    const ext = full.split(".").pop()?.toLowerCase() ?? "";
    const type = TYPES[ext];
    if (!type) return new Response("Not found", { status: 404 });
    const data = await fs.readFile(full);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
