import type { ImageAssetRow } from "@/db/schema";

export function buildCapPrompt(adultAsset: ImageAssetRow): string {
  const orientation = adultAsset.width > adultAsset.height
    ? "The input is landscape."
    : adultAsset.height > adultAsset.width
      ? "The input is portrait."
      : "The input is square.";

  return [
    "Perform a photorealistic image edit of the supplied photograph.",
    "Add a premium black graduation mortarboard naturally worn by the person.",
    "Preserve the exact identity, face, facial proportions, skin tone, hair, body, clothing, pose, camera angle, background, lighting, colors, framing and composition of the original person.",
    "Do not regenerate the person and do not alter their facial identity in any way.",
    "Place the mortarboard precisely on the top of the person's head, following the head angle and perspective.",
    "Make the cap physically believable: correct scale, realistic depth, subtle fabric texture, natural occlusion over hair, accurate contact shadow on the head, soft directional shadow, and a physically plausible tassel hanging from the cap button.",
    "Use a classic elegant black cap with restrained satin/matte material. No oversized cap, no floating cap, no cartoon styling, no plastic appearance.",
    "Do not add a gown, extra clothing, people, objects, text, logos, watermark or decorations.",
    "Do not crop, zoom, rotate or reframe the image.",
    "The result must look like the same original photograph taken on graduation day, with only the graduation cap realistically added.",
    orientation,
  ].join(" ");
}
