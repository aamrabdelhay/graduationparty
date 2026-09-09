import { put, del } from "@vercel/blob";
import sharp from "sharp";
import crypto from "crypto";
import path from "path";
import os from "os";
import fs from "fs/promises";

/**
 * Storage abstraction.
 * Production (Vercel): BLOB_READ_WRITE_TOKEN is required and files go to
 * Vercel Blob. We deliberately do NOT fall back to local disk on Vercel:
 * Vercel's filesystem is ephemeral and a silent fallback makes uploads look
 * successful while losing the asset later.
 * Local development: files are written under uploads/.
 */

const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 8 * 1024 * 1024;

export function validateImage(file: { type: string; size: number }): string | null {
  if (!ACCEPTED.has(file.type)) return "صيغة الصورة غير مدعومة (JPG/PNG/WEBP فقط)";
  if (file.size > MAX_BYTES) return "حجم الصورة أكبر من 8 ميجا";
  if (file.size === 0) return "الملف فارغ";
  return null;
}

/**
 * Local disk fallback root. On Vercel this is /tmp only for backwards
 * compatibility with already-created local URLs; new production uploads
 * are never written here.
 */
export function uploadsRoot() {
  if (process.env.VERCEL) {
    return path.join(os.tmpdir(), "cu-grad-uploads");
  }
  return path.join(process.cwd(), "uploads");
}

function localPathForUrl(url: string): string | null {
  if (url.startsWith("/api/media/")) {
    const rel = decodeURIComponent(url.slice("/api/media/".length));
    const root = path.resolve(uploadsRoot());
    const full = path.resolve(root, rel);
    if (full !== root && !full.startsWith(`${root}${path.sep}`)) return null;
    return full;
  }
  if (url.startsWith("/uploads/")) {
    return path.join(process.cwd(), "public", url);
  }
  return null;
}

export async function storeImage(
  buffer: Buffer,
  subdir: "staging" | "originals" | "generated",
  ext = "jpg",
): Promise<string> {
  const key = `${subdir}/${crypto.randomUUID()}.${ext}`;
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  if (process.env.VERCEL) {
    if (!token) {
      throw new Error("BLOB_READ_WRITE_TOKEN is not configured in the Vercel environment");
    }

    try {
      const res = await put(key, buffer, {
        access: "public",
        contentType: "image/jpeg",
        token,
        addRandomSuffix: false,
      });
      return res.url;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Vercel Blob upload failed: ${message}`);
    }
  }

  const full = path.join(uploadsRoot(), key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buffer);
  return `/api/media/${key}`;
}

export async function deleteImageByUrl(url: string | null | undefined) {
  if (!url) return;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token && /^https?:\/\//.test(url)) {
    try {
      await del(url, { token });
      return;
    } catch (error) {
      console.error("Vercel Blob delete failed", error);
      return;
    }
  }
  const local = localPathForUrl(url);
  if (local) {
    await fs.unlink(local).catch(() => undefined);
  }
}

export async function loadImageBuffer(url: string): Promise<Buffer> {
  const local = localPathForUrl(url);
  if (local) return fs.readFile(local);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`تعذر تحميل الصورة (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/* ------------------------- Image normalization ------------------------- */

export async function normalizeImage(buffer: Buffer) {
  const img = sharp(buffer).rotate();
  return img
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}

/* --------------------- Graduation cap composition ---------------------- */

function capSvg(w: number, h: number): string {
  // Keep the mortarboard proportionally smaller and tighter around the head.
  // The previous version was intentionally oversized, which made the cap float
  // beyond the hairline on many portrait crops.
  const cw = w * 0.46;
  const ch = cw * 0.42;
  const tilt = -4;
  const bandH = cw * 0.19;
  const tasselX = cw * 0.56;
  return `<svg width="${cw}" height="${ch + bandH + 130}" viewBox="-70 -20 ${cw + 140} ${ch + bandH + 170}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="board" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2b2b31"/>
      <stop offset="0.5" stop-color="#15151a"/>
      <stop offset="1" stop-color="#050507"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f6e27a"/>
      <stop offset="0.5" stop-color="#d4af37"/>
      <stop offset="1" stop-color="#a07c1c"/>
    </linearGradient>
    <filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="${Math.max(2, w * 0.003)}"/>
    </filter>
  </defs>
  <g transform="rotate(${tilt} ${cw / 2} ${ch / 2})">
    <ellipse cx="${cw / 2}" cy="${ch + bandH + 25}" rx="${cw * 0.38}" ry="${bandH * 0.38}" fill="#000" opacity="0.28" filter="url(#soft)"/>
    <path d="M ${cw * 0.12} ${ch * 0.91} Q ${cw / 2} ${ch * 1.14} ${cw * 0.88} ${ch * 0.91} L ${cw * 0.88} ${ch + bandH * 0.66} Q ${cw / 2} ${ch + bandH} ${cw * 0.12} ${ch + bandH * 0.66} Z" fill="#101014"/>
    <polygon points="${cw / 2},0 ${cw},${ch * 0.50} ${cw / 2},${ch} 0,${ch * 0.50}" fill="url(#board)" stroke="#3c3c46" stroke-width="${w * 0.0018}"/>
    <polygon points="${cw / 2},0 ${cw},${ch * 0.50} ${cw / 2},${ch} 0,${ch * 0.50}" fill="#ffffff" opacity="0.05"/>
    <circle cx="${cw / 2}" cy="${ch * 0.50}" r="${cw * 0.026}" fill="url(#gold)"/>
    <path d="M ${cw / 2} ${ch * 0.50} Q ${tasselX} ${ch * 0.86} ${cw * 0.965} ${ch + bandH * 1.02}" stroke="url(#gold)" stroke-width="${w * 0.005}" fill="none" stroke-linecap="round"/>
    <rect x="${cw * 0.95}" y="${ch + bandH * 0.96}" width="${w * 0.012}" height="${w * 0.045}" rx="${w * 0.006}" fill="url(#gold)"/>
    <path d="M ${cw * 0.935} ${ch + bandH * 1.39} h ${w * 0.04} l -${w * 0.01} ${w * 0.05} h -${w * 0.02} Z" fill="url(#gold)"/>
  </g>
</svg>`;
}

export async function generateGraduationImage(adultBuffer: Buffer): Promise<Buffer> {
  if (process.env.GEMINI_API_KEY) {
    return generateWithGemini(adultBuffer);
  }
  return generateProcedural(adultBuffer);
}

async function generateProcedural(buffer: Buffer): Promise<Buffer> {
  const base = sharp(buffer)
    .modulate({ saturation: 1.06, brightness: 1.01 })
    .gamma(1.02);
  const meta = await base.metadata();
  const w = meta.width ?? 1200;
  const h = meta.height ?? 1200;
  const svg = Buffer.from(capSvg(w, h));

  // Keep the cap close to the top-center head area instead of pushing it down
  // into the forehead on shorter portrait crops.
  const top = Math.round(h * 0.018);
  const capWidth = w * 0.46;
  const capCanvasWidth = capWidth;

  return base
    .composite([
      {
        input: svg,
        top,
        left: Math.round((w - capCanvasWidth) / 2),
      },
    ])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

async function generateWithGemini(buffer: Buffer): Promise<Buffer> {
  const key = process.env.GEMINI_API_KEY!;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${key}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: [
                    "Edit this photo by adding only a realistic black graduation mortarboard with a subtle golden tassel.",
                    "First detect the person's actual head position, head width, hairline, face angle, and perspective.",
                    "Place the cap centered on the crown of the person's head; the cap band must sit naturally at the hairline and follow the same perspective as the head.",
                    "Scale the cap to fit the head precisely: it should slightly exceed the head width but never float outside it, cover the forehead, or hover above the hair.",
                    "Match the photo's lighting, shadows, depth, rotation, and camera angle.",
                    "Keep the person's face, hair, body, clothes, background, crop, and every other detail unchanged.",
                    "Do not redraw or beautify the person. Do not move the head. Do not change facial features.",
                  ].join(" "),
                },
                { inlineData: { mimeType: "image/jpeg", data: buffer.toString("base64") } },
              ],
            },
          ],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
        }),
      },
    );
    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const json = await res.json();
    const parts = json?.candidates?.[0]?.content?.parts ?? [];
    const img = parts.find((p: any) => p.inlineData?.data);
    if (!img) throw new Error("لم يرجع النموذج صورة");
    return Buffer.from(img.inlineData.data, "base64");
  } finally {
    clearTimeout(timeout);
  }
}
