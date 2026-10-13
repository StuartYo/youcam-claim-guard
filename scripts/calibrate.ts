/**
 * Prints the calibration behind THRESHOLDS in lib/conditions.ts.
 * For each check: the largest difference seen inside one session (must pass) and the smallest
 * difference seen between sessions (should fail), then every photo pair through compareConditions.
 * Exits 1 if any required pass/fail expectation is broken.
 *
 * These numbers are IN-SAMPLE: the thresholds were chosen by looking at these same 15 photos
 * (one face, one phone, one day). A full pass/block score here is a consistency check, not an accuracy figure.
 *
 * Held-out check: photos that played no part in choosing the thresholds go in photos/session4/,
 * one subfolder per lighting setup, e.g.
 *   photos/session4/desk-a/*.jpg        same spot, same light  -> pairs inside the folder should pass
 *   photos/session4/window-b/*.jpg      another setup          -> pairs across folders should be blocked
 *   photos/session4/backlit-c/*.jpg     folder name starting with "backlit" -> pairs inside should be blocked too
 * The held-out rates are reported separately and never mixed into the in-sample numbers.
 *
 * Usage: npm run calibrate [-- --heldout photos/session4]
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { compareConditions, THRESHOLDS, type CaptureStats } from "../lib/conditions";
import type { DemoData, DemoPhoto } from "../lib/demo-types";
import { measure } from "../lib/measure";
import { pairTally } from "../lib/summary";

const ROOT = path.resolve(__dirname, "..");
const data: DemoData = JSON.parse(readFileSync(path.join(ROOT, "data", "scores.json"), "utf-8"));
const P = data.photos;

const metrics: Array<{ name: string; f: (a: CaptureStats, b: CaptureStats) => number; limit: number; unit: string }> = [
  { name: "face brightness (relative)", f: (a, b) => Math.abs(b.centerLum - a.centerLum) / a.centerLum, limit: THRESHOLDS.faceLumRelative, unit: "%" },
  { name: "face/background ratio (abs)", f: (a, b) => Math.abs(b.backlightRatio - a.backlightRatio), limit: THRESHOLDS.backlightRatioDelta, unit: "" },
  { name: "blown-out background (max)", f: (a, b) => Math.max(a.clippedBorder, b.clippedBorder), limit: THRESHOLDS.clippedBorder, unit: "%" },
  { name: "red/blue colour (relative)", f: (a, b) => Math.abs(b.redBlue - a.redBlue) / a.redBlue, limit: THRESHOLDS.redBlueRelative, unit: "%" },
];

const pairs: Array<[DemoPhoto, DemoPhoto]> = [];
for (const a of P) for (const b of P) if (a !== b) pairs.push([a, b]);
const key = (a: DemoPhoto, b: DemoPhoto) => [a.session, b.session].sort().join("-");
const fmt = (v: number, unit: string) => (unit === "%" ? `${(v * 100).toFixed(1)}%` : v.toFixed(3));

console.log("Per-photo capture stats");
for (const p of P) console.log(`  ${p.session} ${p.id}  ${JSON.stringify(p.capture)}`);

console.log("\nPer check: largest within-session difference vs smallest between-session difference");
for (const m of metrics) {
  const groups = new Map<string, number[]>();
  for (const [a, b] of pairs) {
    const k = key(a, b);
    groups.set(k, [...(groups.get(k) ?? []), m.f(a.capture, b.capture)]);
  }
  const row = [...groups.entries()]
    .sort()
    .map(([k, v]) => {
      const same = k[0] + k[1] === k[3] + k[4];
      return `${k}: ${same ? "max" : "min"} ${fmt(same ? Math.max(...v) : Math.min(...v), m.unit)}`;
    })
    .join(" | ");
  console.log(`  ${m.name.padEnd(30)} limit ${fmt(m.limit, m.unit).padEnd(7)} ${row}`);
}

console.log("\nAll ordered photo pairs through compareConditions");
const tally = new Map<string, { pass: number; fail: number; reasons: Set<string> }>();
for (const [a, b] of pairs) {
  const r = compareConditions(a.capture, b.capture);
  const k = key(a, b);
  const t = tally.get(k) ?? { pass: 0, fail: 0, reasons: new Set<string>() };
  if (r.match) t.pass++;
  else {
    t.fail++;
    r.checks.filter((c) => !c.pass).forEach((c) => t.reasons.add(c.label));
  }
  tally.set(k, t);
}
const expect: Record<string, "pass" | "fail" | "info"> = { "s1-s1": "pass", "s1-s3": "fail", "s1-s2": "fail", "s2-s2": "fail", "s2-s3": "fail", "s3-s3": "info" };
let ok = true;
for (const [k, t] of [...tally.entries()].sort()) {
  const want = expect[k];
  const good = want === "pass" ? t.fail === 0 : want === "fail" ? t.pass === 0 : true;
  if (!good) ok = false;
  console.log(`  ${k}: ${t.pass} pass, ${t.fail} fail  [expect ${want}] ${good ? "OK" : "BROKEN"}  failing checks: ${[...t.reasons].join(", ") || "none"}`);
}
const t = pairTally(P);
console.log(
  `\nIn-sample summary: ${t.sameLight.passed}/${t.sameLight.total} same-light pairs pass, ${t.changed.blocked}/${t.changed.total} different-light or backlit pairs blocked, ` +
    `${t.ceilingOnly.passed}/${t.ceilingOnly.total} ceiling-only pairs pass (not used for calibration).`,
);
console.log("These are in-sample: the limits were set on these same photos. They are not an accuracy figure.");

async function heldOut(dir: string) {
  const abs = path.resolve(ROOT, dir);
  const groups = existsSync(abs) ? readdirSync(abs).filter((g) => statSync(path.join(abs, g)).isDirectory()) : [];
  const shots: Array<{ group: string; file: string; capture: CaptureStats }> = [];
  for (const g of groups.sort()) {
    for (const f of readdirSync(path.join(abs, g)).filter((x) => /\.(jpe?g|png)$/i.test(x)).sort()) {
      // Same pipeline as the demo photos: 720 px JPEG, then measure (which resizes to 360 px).
      const buf = await sharp(path.join(abs, g, f)).rotate().resize(720, 720, { fit: "inside" }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
      shots.push({ group: g, file: f, capture: await measure(buf) });
    }
  }
  if (shots.length < 2) {
    console.log(`\nHeld-out check: pending (no photos in ${dir}/<setup>/).`);
    return;
  }
  let sameTotal = 0, samePass = 0, crossTotal = 0, crossBlock = 0, backTotal = 0, backBlock = 0;
  for (const a of shots)
    for (const b of shots) {
      if (a === b) continue;
      const ok = compareConditions(a.capture, b.capture).match;
      if (a.group !== b.group) {
        crossTotal++;
        if (!ok) crossBlock++;
      } else if (a.group.toLowerCase().startsWith("backlit")) {
        backTotal++;
        if (!ok) backBlock++;
      } else {
        sameTotal++;
        if (ok) samePass++;
      }
    }
  const rate = (n: number, d: number) => (d ? `${n}/${d} (${((n / d) * 100).toFixed(1)}%)` : "no pairs");
  console.log(`\nHeld-out check (${shots.length} photos in ${groups.length} setups from ${dir}, not used to set the limits)`);
  for (const s of shots) console.log(`  ${s.group}/${s.file}  ${JSON.stringify(s.capture)}`);
  console.log(`  same setup, pass rate:        ${rate(samePass, sameTotal)}`);
  console.log(`  different setup, block rate:  ${rate(crossBlock, crossTotal)}`);
  console.log(`  backlit setup, block rate:    ${rate(backBlock, backTotal)}`);
}

const argIdx = process.argv.indexOf("--heldout");
heldOut(argIdx > 0 ? process.argv[argIdx + 1] : "photos/session4").then(() => {
  if (!ok) {
    console.error("\nIn-sample calibration expectations broken.");
    process.exit(1);
  }
  console.log("\nIn-sample calibration OK.");
});
