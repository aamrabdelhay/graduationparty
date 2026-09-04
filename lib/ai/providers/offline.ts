/**
 * Offline "placeholder" cap generator (development / tests only).
 *
 * Renders a realistic-looking mortarboard as an SVG composite positioned with
 * a portrait heuristic over the upper head area of the adult photo. It exists
 * so the whole pipeline (upload → validate → store → AI → store generated)
 * can run end-to-end without external network access. Production must use a
 * real image-editing provider (see AI_PROVIDER=openai).
 */
import sharp from "sharp";
import { getStorage } from "@/lib/storage";
import { CapGenerationError, type CapGenerationResult, type CapGenerator, type CapGenerationInput } from "@/lib/ai/types";

const CAP_COLOR = "#14161c";
const CAP_EDGE = "#24272f";
const TASSEL = "#c9a227";

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export class OfflineCapGenerator implements CapGenerator {
  readonly providerName = "offline";

  async generate(input: CapGenerationInput): Promise<CapGenerationResult> {
    try {
      const original = await getStorage().get(input.adultAsset.storageKey);
      const meta = await sharp(original).metadata();
      const width = meta.width ?? 800;
      const height = meta.height ?? 800;

      const base = await sharp(original)
        .resize(width, height, { fit: "fill" })
        .toBuffer();

      const minDim = Math.min(width, height);
      // Heuristic: board half-width scaled to image; centered on the head area
      // in the upper middle of the frame (typical for portraits).
      const a = Math.round(minDim * 0.24);
      const cx = Math.round(width / 2);
      const cy = Math.round(height * 0.15);
      const v = Math.round(a * 0.42); // vertical half of the diamond
      const offX = Math.round(a * 0.1);
      const offY = Math.round(a * 0.14);

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <defs>
          <linearGradient id="capTop" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#20242c"/>
            <stop offset="55%" stop-color="${CAP_COLOR}"/>
            <stop offset="100%" stop-color="#0c0e12"/>
          </linearGradient>
          <filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="${Math.max(2, Math.round(minDim * 0.006))}"/>
          </filter>
        </defs>

        <!-- soft shadow cast on the head -->
        <ellipse cx="${cx}" cy="${cy + v + offY * 0.6}" rx="${a * 1.15}" ry="${a * 0.34}"
          fill="rgba(0,0,0,0.25)" filter="url(#soft)"/>

        <!-- thickness / lower layer (skewed down-right) -->
        <polygon points="${cx - a + offX},${cy + offY} ${cx},${cy - v + offY} ${cx + a + offX},${cy + offY} ${cx + offX},${cy + v + offY}"
          fill="${CAP_EDGE}" opacity="0.96"/>
        <polygon points="${cx - a},${cy} ${cx},${cy - v} ${cx + a},${cy} ${cx},${cy + v}" fill="url(#capTop)"/>

        <!-- top highlight edge -->
        <polygon points="${cx - a * 0.86},${cy} ${cx},${cy - v * 0.86} ${cx + a * 0.86},${cy} ${cx},${cy + v * 0.86}"
          fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="${Math.max(1, Math.round(a * 0.02))}"/>

        <!-- center button -->
        <circle cx="${cx}" cy="${cy}" r="${Math.max(2, Math.round(a * 0.055))}" fill="#05070a"/>
        <circle cx="${cx}" cy="${cy}" r="${Math.max(2, Math.round(a * 0.045))}" fill="#2a2f38"/>

        <!-- tassel -->
        <path d="M ${cx} ${cy + v * 0.9} C ${cx + a * 0.55} ${cy + v * 0.9}, ${cx + a * 0.75} ${cy + v * 0.5}, ${cx + a * 0.92} ${cy + v * 1.9}"
          fill="none" stroke="${TASSEL}" stroke-width="${Math.max(1.5, Math.round(a * 0.035))}" stroke-linecap="round" opacity="0.95"/>
        <ellipse cx="${cx + a * 0.94}" cy="${cy + v * 2.05}" rx="${a * 0.075}" ry="${a * 0.13}"
          fill="${TASSEL}" transform="rotate(18 ${cx + a * 0.94} ${cy + v * 2.05})"/>
      </svg>`;

      const output = await sharp(base)
        .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
        .png()
        .toBuffer();

      return { buffer: output, mimeType: "image/png", extension: "png", provider: this.providerName };
    } catch (err) {
      if (err instanceof CapGenerationError) throw err;
      throw new CapGenerationError("Graduation cap generation failed. You can retry.", { cause: err });
    }
  }
}
