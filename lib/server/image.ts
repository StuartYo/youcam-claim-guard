import sharp from "sharp";
import { MAX_IMAGE_BYTES } from "../brand-api";
import { MAX_INPUT_PIXELS } from "../measure";

/** One photo limit for every route: the same 4 MB as the brand API. The browser downscales larger photos before upload. */
export const MAX_BYTES = MAX_IMAGE_BYTES;
export const MAX_LONG_SIDE = 2560;
export const MIN_SHORT_SIDE = 480;
const TYPES = new Set(["image/jpeg", "image/png"]);

export class InputError extends Error {}

export interface PreparedImage {
  /** Bytes as received; hashed for the cache. */
  original: Buffer;
  /** Re-encoded JPEG, long side <= 2560, metadata stripped. This is what YouCam receives. */
  jpeg: Buffer;
  width: number;
  height: number;
}

function sniff(b: Buffer): "image/jpeg" | "image/png" | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  return null;
}

export async function prepareImage(file: File | null, label: string): Promise<PreparedImage> {
  if (!file || typeof file === "string") throw new InputError(`Add a ${label} photo.`);
  if (file.size > MAX_BYTES) throw new InputError(`The ${label} photo is ${(file.size / 1048576).toFixed(1)} MB. The limit is 4 MB per photo.`);
  if (file.type && !TYPES.has(file.type)) throw new InputError(`The ${label} photo must be JPG or PNG.`);
  const original = Buffer.from(await file.arrayBuffer());
  if (!sniff(original)) throw new InputError(`The ${label} file is not a JPG or PNG image.`);
  let img = sharp(original, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS }).rotate();
  const meta = await img.metadata();
  let w = meta.autoOrient?.width ?? meta.width ?? 0;
  let h = meta.autoOrient?.height ?? meta.height ?? 0;
  if (!w || !h) throw new InputError(`The ${label} photo could not be read.`);
  if (Math.min(w, h) < MIN_SHORT_SIDE) throw new InputError(`The ${label} photo is ${w}x${h}. The short side must be at least ${MIN_SHORT_SIDE} px.`);
  if (Math.max(w, h) > MAX_LONG_SIDE) {
    img = img.resize(MAX_LONG_SIDE, MAX_LONG_SIDE, { fit: "inside" });
    const s = MAX_LONG_SIDE / Math.max(w, h);
    w = Math.round(w * s);
    h = Math.round(h * s);
  }
  const jpeg = await img.jpeg({ quality: 92 }).toBuffer();
  return { original, jpeg, width: w, height: h };
}

export function clientIp(headers: Headers): string {
  const xf = headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "local";
}
