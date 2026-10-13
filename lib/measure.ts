import sharp from "sharp";
import type { CaptureStats } from "./conditions";

/** Photos are resized to fit inside this box before measuring, so the stats don't depend on resolution. */
const BOX = 360;

/** Face region: the central box where a frontal selfie puts cheeks, nose and mouth. */
export const CENTER = { x0: 0.32, x1: 0.68, y0: 0.32, y1: 0.62 };
/** Background: left and right strips beside the head (top has hair, bottom has clothing). */
export const SIDE = { width: 0.12, y0: 0.15, y1: 0.75 };
/** A background pixel at or above this luma counts as blown out (a window or lamp behind the person). */
export const CLIP_LUMA = 235;

const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

/** Refuse images above this many pixels before decoding them fully (decompression bombs). */
export const MAX_INPUT_PIXELS = 40_000_000;

export async function measure(input: Buffer | string): Promise<CaptureStats> {
  const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize(BOX, BOX, { fit: "inside" })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  let cL = 0, cR = 0, cB = 0, cN = 0, sL = 0, sN = 0, clip = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * c;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const L = luma(r, g, b);
      if (x >= w * CENTER.x0 && x < w * CENTER.x1 && y >= h * CENTER.y0 && y < h * CENTER.y1) {
        cL += L; cR += r; cB += b; cN++;
      } else if ((x < w * SIDE.width || x >= w * (1 - SIDE.width)) && y >= h * SIDE.y0 && y < h * SIDE.y1) {
        sL += L; sN++;
        if (L >= CLIP_LUMA) clip++;
      }
    }
  }
  const centerLum = cL / cN;
  const borderLum = sL / sN;
  return {
    centerLum: round(centerLum),
    borderLum: round(borderLum),
    backlightRatio: round(centerLum / borderLum, 3),
    clippedBorder: round(clip / sN, 3),
    redBlue: round(cR / Math.max(cB, 1), 3),
  };
}
