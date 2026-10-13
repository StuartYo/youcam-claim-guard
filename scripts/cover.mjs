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
const ceiling = await pick("session3", "IMG_1374");
const windowShot = await pick("session2", "IMG_1399");

// The "ceiling light to window" case: same face, same day. The app would show Moisture +9%.
const data = JSON.parse(readFileSync(path.join(ROOT, "data", "scores.json"), "utf-8"));
const ui = (id) => data.photos.find((p) => p.id === id).scores.moisture.ui;
const pct = Math.round(((ui("IMG_1399") - ui("IMG_1374")) / ui("IMG_1374")) * 100);

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;600&family=Instrument+Serif&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0}
body{width:1500px;height:1000px;background:#f6f1ec;color:#2b2025;font-family:"Instrument Sans",sans-serif;display:grid;grid-template-rows:auto 1fr auto;padding:64px 72px 56px}
.top{display:flex;justify-content:space-between;align-items:center}
.brand{display:flex;gap:14px;align-items:center;font:400 44px/1 "Instrument Serif",serif}
.brand svg{width:38px;height:38px;fill:none;stroke:#9b4a5f;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.tag{font-size:20px;color:#76686d}
.row{display:grid;grid-template-columns:1fr 300px 1fr;align-items:center;gap:36px;margin:36px 0 28px}
figure{position:relative}
img{width:100%;height:560px;object-fit:cover;object-position:50% 52%;border-radius:22px;display:block}
figcaption{position:absolute;left:16px;bottom:16px;background:rgba(255,253,251,.94);padding:8px 16px;border-radius:999px;font-weight:600;font-size:22px}
.mid{text-align:center}
.badge{display:inline-block;font:600 64px/1 "Instrument Sans",sans-serif;padding:20px 34px;border:2px dashed #cdb9ab;border-radius:999px;color:#76686d;position:relative}
.badge::after{content:"";position:absolute;left:18px;right:18px;top:50%;height:6px;margin-top:-3px;background:#a8433f;border-radius:3px;transform:rotate(-8deg)}
.mid p{margin-top:20px;font-size:22px;color:#a8433f;font-weight:600}
h1{font:400 76px/1.05 "Instrument Serif",serif;letter-spacing:-.01em}
.foot{display:flex;justify-content:space-between;align-items:end}
.foot span{font-size:18px;color:#76686d}
</style></head><body>
<div class="top"><div class="brand"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M7.5 12.5l3 3 6-7"/></svg>Claim Guard</div>
<div class="tag">YouCam skin analysis, checked before the badge</div></div>
<div class="row">
<figure><img src="${ceiling}"><figcaption>Ceiling light</figcaption></figure>
<div class="mid"><span class="badge">+${pct}%</span><p>Moisture badge held back</p></div>
<figure><img src="${windowShot}"><figcaption>Window</figcaption></figure>
</div>
<div class="foot"><h1>Same face. Same day. Different lamp.</h1><span>Developer's own photos</span></div>
</body></html>`;

mkdirSync(path.join(ROOT, "submission"), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
await page.setContent(html, { waitUntil: "networkidle" });
await page.screenshot({ path: path.join(ROOT, "submission", "cover.png") });
await browser.close();
console.log("wrote submission/cover.png");
