/**
 * Renders the Devpost cover (1500 x 1000) from HTML with Playwright. No generated imagery: two real photos and text.
 * Uses the full-size local photos when present (gitignored), otherwise the 720 px demo copies.
 * Usage: node scripts/cover.mjs   (needs Playwright installed locally or globally)
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const req = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = req("playwright"));
} catch {
  ({ chromium } = createRequire(path.join(process.env.APPDATA ?? "", "npm", "node_modules", "x.js"))("playwright"));
}

// Inlined as data URIs: a page loaded with setContent can't read file:// URLs.
const sharp = req("sharp");
const pick = async (session, id) => {
  const full = path.join(ROOT, "photos", session, `${id}.jpg`);
  const src = existsSync(full) ? full : path.join(ROOT, "public", "demo", `${id}.jpg`);
  const buf = await sharp(src).rotate().resize(1000, 1000, { fit: "inside" }).jpeg({ quality: 88 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
};
// The headline case: held-out pair from data.lampOnly (photos/session4/lamp-only.json). Same face, same room, ceiling
// light to desk lamp, phone re-positioned. Not a lamp-only pair, and the cover says so.
const data = JSON.parse(readFileSync(path.join(ROOT, "data", "scores.json"), "utf-8"));
const { beforeId, afterId } = data.lampOnly;
const heldPhoto = (id) => data.heldOut.find((p) => p.id === id);
const before = await pick(`session4/${heldPhoto(beforeId).setup}`, beforeId);
const after = await pick(`session4/${heldPhoto(afterId).setup}`, afterId);
const ui = (id) => heldPhoto(id).scores.moisture.ui;
const pct = Math.round(((ui(afterId) - ui(beforeId)) / ui(beforeId)) * 100);

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;600&family=Instrument+Serif&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0}
body{width:1500px;height:1000px;background:#f6f1ec;color:#2b2025;font-family:"Instrument Sans",sans-serif;display:grid;grid-template-rows:auto 1fr auto;padding:56px 64px 48px}
.top{display:flex;justify-content:space-between;align-items:center}
.brand{display:flex;gap:14px;align-items:center;font:400 44px/1 "Instrument Serif",serif}
.brand svg{width:38px;height:38px;fill:none;stroke:#9b4a5f;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.tag{font-size:26px;color:#76686d}
.row{display:grid;grid-template-columns:1fr 470px 1fr;align-items:center;gap:24px;margin:28px 0 24px}
figure{position:relative}
img{width:100%;height:600px;object-fit:cover;object-position:50% 52%;border-radius:22px;display:block}
figcaption{position:absolute;left:16px;bottom:16px;background:rgba(255,253,251,.94);padding:10px 20px;border-radius:999px;font-weight:600;font-size:28px;white-space:nowrap}
.mid{text-align:center}
.badge{display:inline-block;font:600 190px/1 "Instrument Sans",sans-serif;letter-spacing:-.03em;padding:28px 34px;border:4px dashed #cdb9ab;border-radius:999px;color:#76686d;position:relative}
.badge::after{content:"";position:absolute;left:10px;right:10px;top:50%;height:18px;margin-top:-9px;background:#a8433f;border-radius:9px;transform:rotate(-10deg)}
.mid p{margin-top:22px;font-size:36px;line-height:1.15;color:#a8433f;font-weight:600}
h1{font:400 80px/1.02 "Instrument Serif",serif;letter-spacing:-.01em}
.foot{display:flex;justify-content:space-between;align-items:end}
.foot span{font-size:24px;color:#76686d;white-space:nowrap}
</style></head><body>
<div class="top"><div class="brand"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M7.5 12.5l3 3 6-7"/></svg>Claim Guard</div>
<div class="tag">YouCam skin analysis, checked before the badge</div></div>
<div class="row">
<figure><img src="${before}"><figcaption>Ceiling light</figcaption></figure>
<div class="mid"><span class="badge">+${pct}%</span><p>Moisture badge blocked</p></div>
<figure><img src="${after}"><figcaption>Desk lamp, phone moved</figcaption></figure>
</div>
<div class="foot"><h1>Same face, same room.<br>Desk lamp instead of ceiling light.</h1><span>Developer's own photos</span></div>
</body></html>`;

mkdirSync(path.join(ROOT, "submission"), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
await page.setContent(html, { waitUntil: "networkidle" });
await page.screenshot({ path: path.join(ROOT, "submission", "cover.png") });
await browser.close();
console.log("wrote submission/cover.png");
