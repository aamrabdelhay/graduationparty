import { getAsset } from "@/lib/assets";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const asset = await getAsset(id);
  if (!asset) return jsonError("Image not found.", 404, "NOT_FOUND");

  if (asset.storageProvider === "database") {
    const encoded = (asset.metadata as Record<string, unknown> | null)?._databaseImageBase64;
    if (typeof encoded !== "string" || !encoded) {
      return jsonError("Image data is unavailable.", 404, "IMAGE_DATA_MISSING");
    }
    return new Response(Buffer.from(encoded, "base64"), {
      status: 200,
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(asset.fileSize),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  return Response.redirect(asset.publicUrl, 302);
}
