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
  const cw = w * 0.56;
  const ch = cw * 0.46;
  const tilt = -5;
  const bandH = cw * 0.24;
  const tasselX = cw * 0.52;
  return `<svg width="${cw + 220}" height="${ch + bandH + 260}" viewBox="-110 -30 ${cw + 220} ${ch + bandH + 320}" xmlns="http://www.w3.org/2000/svg">
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
      <feGaussianBlur stdDeviation="${Math.max(3, w * 0.004)}"/>
    </filter>
  </defs>
  <g transform="rotate(${tilt} ${cw / 2} ${ch / 2})">
    <ellipse cx="${cw / 2}" cy="${ch + bandH + 40}" rx="${cw * 0.42}" ry="${bandH * 0.5}" fill="#000" opacity="0.35" filter="url(#soft)"/>
    <path d="M ${cw * 0.10} ${ch * 0.92} Q ${cw / 2} ${ch * 1.18} ${cw * 0.90} ${ch * 0.92} L ${cw * 0.90} ${ch + bandH * 0.7} Q ${cw / 2} ${ch + bandH} ${cw * 0.10} ${ch + bandH * 0.7} Z" fill="#101014"/>
    <polygon points="${cw / 2},0 ${cw},${ch * 0.52} ${cw / 2},${ch} 0,${ch * 0.52}" fill="url(#board)" stroke="#3c3c46" stroke-width="${w * 0.002}"/>
    <polygon points="${cw / 2},0 ${cw},${ch * 0.52} ${cw / 2},${ch} 0,${ch * 0.52}" fill="#ffffff" opacity="0.05"/>
    <circle cx="${cw / 2}" cy="${ch * 0.52}" r="${cw * 0.028}" fill="url(#gold)"/>
    <path d="M ${cw / 2} ${ch * 0.52} Q ${tasselX} ${ch * 0.9} ${cw * 0.97} ${ch + bandH * 1.1}" stroke="url(#gold)" stroke-width="${w * 0.006}" fill="none" stroke-linecap="round"/>
    <rect x="${cw * 0.955}" y="${ch + bandH * 1.02}" width="${w * 0.014}" height="${w * 0.05}" rx="${w * 0.007}" fill="url(#gold)"/>
    <path d="M ${cw * 0.94} ${ch + bandH * 1.52} h ${w * 0.045} l -${w * 0.011} ${w * 0.055} h -${w * 0.023} Z" fill="url(#gold)"/>
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
  const top = Math.round(h * 0.05);
  return base
    .composite([{ input: svg, top, left: Math.round((w - w * 0.56 - 220) / 2) }])
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
                  text: "Edit this photo: add an elegant black graduation mortarboard cap with a golden tassel on the person's head, fitted naturally to the head's size, angle and position. Keep everything else identical.",
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
