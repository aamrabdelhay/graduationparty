/**
 * Prompt engineering for the graduation-cap edit. Written to make the model
 * treat the task as an *edit* (identity/lighting/clothing/background preserved)
 * rather than a regeneration of the person.
 */
import type { ImageAssetRow } from "@/db/schema";

export function buildCapPrompt(adultAsset: ImageAssetRow): string {
  const widthHint =
    adultAsset.width > adultAsset.height
      ? "The photo is landscape oriented."
      : adultAsset.height > adultAsset.width
        ? "The photo is portrait oriented."
        : "The photo is square.";

  return [
    "Edit the photograph to add a realistic black graduation cap (mortarboard with a tassel) on the head of the person in the photo.",
    "This is an EDIT, not a new image. Keep all of the following exactly the same: the identity and facial features of the person, their clothing, the background, the lighting, the colors and the overall composition.",
    "Do not change the person's age, face, hairstyle under the cap, outfit or surroundings.",
    "Make the cap fit the person's head naturally: match its size to the head, follow the angle/tilt of the head, respect perspective, and add soft, realistic shadows so it looks like the person was photographed while actually wearing it.",
    "Place the cap slightly on top of the head, tilted naturally; keep the tassel hanging realistically.",
    "Do not add text, watermarks, logos, extra people or extra objects.",
    "Do not crop or re-frame the photo; keep the same composition as the input.",
    widthHint,
    "Return the edited image with the same composition and resolution intent as the input.",
  ].join(" ");
}
