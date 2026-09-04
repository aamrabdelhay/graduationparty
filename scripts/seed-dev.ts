/**
 * Development seed — clearly isolated demo data.
 * - Runs ONLY when NODE_ENV !== "production" (never on Vercel prod builds).
 * - Generates synthetic placeholder photos locally (no real people), which
 *   makes it safe to demonstrate the queue, groups and presentation.
 *
 * Usage: npm run db:seed
 */
import "dotenv/config";
import sharp from "sharp";
import { getDb } from "@/db";
import { createSubmission } from "@/lib/submissions/service";
import { createImageAsset } from "@/lib/assets";
import { presentationUpdateSettings } from "@/lib/presentation/state";
import { isProduction } from "@/lib/env";
import { logActivity } from "@/lib/activity";

async function placeholder(kind: "childhood" | "adult"): Promise<Buffer> {
  const w = 640;
  const h = 800;
  const top = kind === "childhood" ? { r: 208, g: 222, b: 242 } : { r: 70, g: 88, b: 118 };
  const bottom = kind === "childhood" ? { r: 160, g: 178, b: 208 } : { r: 30, g: 42, b: 66 };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0.2" y2="1">
      <stop offset="0" stop-color="rgb(${top.r},${top.g},${top.b})"/>
      <stop offset="1" stop-color="rgb(${bottom.r},${bottom.g},${bottom.b})"/>
    </linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    <ellipse cx="${w / 2}" cy="${h * 0.36}" rx="${w * 0.22}" ry="${h * 0.26}" fill="rgba(255,255,255,0.35)"/>
    <rect x="${w * 0.16}" y="${h * 0.62}" width="${w * 0.68}" height="${h * 0.3}" rx="${w * 0.06}" fill="rgba(255,255,255,0.22)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
}

async function uploadStaged(kind: "CHILDHOOD" | "ADULT", bufKind: "childhood" | "adult") {
  const buffer = await placeholder(bufKind);
  return createImageAsset({
    kind,
    buffer,
    mimeType: "image/jpeg",
    extension: "jpg",
    width: 640,
    height: 800,
    committed: false,
    metadata: { context: "dev-seed" },
  });
}

async function main() {
  if (isProduction()) {
    console.error("Refusing to seed in production. NODE_ENV=production detected.");
    process.exit(1);
  }
  const db = getDb();
  const existing = await db.select({ id: (await import("@/db/schema")).participant.id }).from((await import("@/db/schema")).participant).limit(1);
  if (existing.length > 0) {
    console.log("[seed] participants already exist — skipping (delete rows first if you want a fresh seed).");
    process.exit(0);
  }

  const names: Array<{ type: "INDIVIDUAL" | "GROUP"; people: string[] }> = [
    { type: "INDIVIDUAL", people: ["Ahmed Mohamed Ali Hassan"] },
    { type: "GROUP", people: ["Mohamed Ahmed Ali Hassan", "Sara Mahmoud Ali Hassan", "Omar Mostafa Ali Hassan"] },
    { type: "INDIVIDUAL", people: ["Laila Nour Eldin"] },
    { type: "GROUP", people: ["Yousef Khaled Ibrahim", "Nour Khaled Ibrahim"] },
    { type: "INDIVIDUAL", people: ["هدى سامي عبد الرحمن"] },
  ];

  for (const submission of names) {
    const participants: Array<{ fullName: string; childhoodImageId: string; adultImageId: string; adultAssetId: string }> = [];
    for (const fullName of submission.people) {
      const child = await uploadStaged("CHILDHOOD", "childhood");
      const adult = await uploadStaged("ADULT", "adult");
      participants.push({
        fullName,
        childhoodImageId: child.id,
        adultImageId: adult.id,
        adultAssetId: adult.id,
      });
    }
    const result = await createSubmission({
      type: submission.type,
      participants: participants.map((p) => ({
        fullName: p.fullName,
        childhoodImageId: p.childhoodImageId,
        adultImageId: p.adultImageId,
      })),
      source: "PUBLIC",
    });
    console.log(
      `[seed] ${submission.type} ${submission.people.join(", ")} → submission ${result.submissionId.slice(0, 8)}${result.groupNumber ? ` (${"Group #" + String(result.groupNumber).padStart(3, "0")})` : ""}`,
    );

    // Generate a graduation photo for every participant (offline provider).
    const { generateAndStoreGraduationImage } = await import("@/lib/ai");
    const { participant: participantTable } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { getAsset } = await import("@/lib/assets");
    for (let i = 0; i < result.participantIds.length; i++) {
      const pid = result.participantIds[i]!;
      const adult = await getAsset(participants[i]!.adultAssetId);
      if (!adult) continue;
      const { asset } = await generateAndStoreGraduationImage({
        adultAsset: adult,
        committed: true,
        participantId: pid,
        metadata: { context: "dev-seed" },
      });
      await db.update(participantTable).set({ graduationImageId: asset.id, aiStatus: "COMPLETED" }).where(eq(participantTable.id, pid));
    }
  }

  await presentationUpdateSettings({});
  await logActivity({ action: "dev_seed", metadata: { names: names.flatMap((n) => n.people).length } });
  console.log("[seed] done — dev data ready (public flow, admin queue and projector).");
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
