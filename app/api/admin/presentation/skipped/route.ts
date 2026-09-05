import { asc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getDb } from "@/db";
import { participant, imageAsset } from "@/db/schema";
import { jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const db = getDb();
  const rows = await db
    .select({
      id: participant.id,
      fullName: participant.fullName,
      presentationOrder: participant.presentationOrder,
      graduationAssetId: participant.graduationImageId,
      childhoodAssetId: participant.childhoodImageId,
    })
    .from(participant)
    .where(eq(participant.presentationStatus, "SKIPPED"))
    .orderBy(asc(participant.presentationOrder));

  const result = await Promise.all(rows.map(async (row) => {
    const assetId = row.graduationAssetId ?? row.childhoodAssetId;
    const assets = assetId
      ? await db.select({ publicUrl: imageAsset.publicUrl }).from(imageAsset).where(eq(imageAsset.id, assetId)).limit(1)
      : [];
    return { id: row.id, fullName: row.fullName, presentationOrder: row.presentationOrder, thumb: assets[0]?.publicUrl ?? null };
  }));
  return jsonOk({ skipped: result });
}
