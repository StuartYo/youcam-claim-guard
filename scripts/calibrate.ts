/**
 * Prints the calibration behind THRESHOLDS in lib/conditions.ts.
 * For each check: the largest difference seen inside one session (must pass) and the smallest
 * difference seen between sessions (should fail), then every photo pair through compareConditions.
 * Exits 1 if any required pass/fail expectation is broken.
 *
 * These numbers are IN-SAMPLE: the thresholds were chosen by looking at these same 15 photos
 * (one face, one phone, one day). A full pass/block score here is a consistency check, not an accuracy figure.
 *
 * Held-out check: photos that played no part in choosing the version 1 thresholds go in photos/session4/,
 * one subfolder per lighting setup, e.g.
 *   photos/session4/A/*.jpg   ceiling light
 *   photos/session4/B/*.jpg   desk lamp, phone re-positioned
 *   photos/session4/C/*.jpg   desk lamp as B, after washing the face and applying a moisturizer
 * lib/heldout.ts says which setups share the same light. Pairs inside a setup should pass, pairs across different light
 * should be blocked, and pairs across setups with the same light (B-C) should pass because only the skin changed.
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
import { failingText, HELD_OUT_SETUPS, heldOutSentenceV1, heldOutSentenceV2, heldOutTally, pctOf, type HeldOutShot, type PairCount } from "../lib/heldout";
import { pairSentence, pairTally } from "../lib/summary";

const ROOT = path.resolve(__dirname, "..");
const data: DemoData = JSON.parse(readFileSync(path.join(ROOT, "data", "scores.json"), "utf-8"));
const P = data.photos;

const metrics: Array<{ name: string; f: (a: CaptureStats, b: CaptureStats) => number; limit: number; unit: string }> = [
  { name: "face/background brightness (rel)", f: (a, b) => Math.abs(b.backlightRatio - a.backlightRatio) / a.backlightRatio, limit: THRESHOLDS.faceLumRelative, unit: "%" },
  { name: "blown-out background (max)", f: (a, b) => Math.max(a.clippedBorder, b.clippedBorder), limit: THRESHOLDS.clippedBorder, unit: "%" },
  { name: "background red/blue (relative)", f: (a, b) => Math.abs(b.bgRedBlue - a.bgRedBlue) / a.bgRedBlue, limit: THRESHOLDS.redBlueRelative, unit: "%" },
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
const expect: Record<string, "pass" | "fail"> = { "s1-s1": "pass", "s1-s3": "fail", "s1-s2": "fail", "s2-s2": "fail", "s2-s3": "fail", "s3-s3": "pass" };
let ok = true;
for (const [k, t] of [...tally.entries()].sort()) {
  const want = expect[k];
  const good = want === "pass" ? t.fail === 0 : want === "fail" ? t.pass === 0 : true;
  if (!good) ok = false;
  console.log(`  ${k}: ${t.pass} pass, ${t.fail} fail  [expect ${want}] ${good ? "OK" : "BROKEN"}  failing checks: ${[...t.reasons].join(", ") || "none"}`);
}
const t = pairTally(P);
console.log(`\nIn-sample summary: ${pairSentence(t)}`);
console.log("These are in-sample: the limits were set on these same photos. They are not an accuracy figure.");

async function heldOut(dir: string) {
  const abs = path.resolve(ROOT, dir);
  const groups = existsSync(abs) ? readdirSync(abs).filter((g) => statSync(path.join(abs, g)).isDirectory()) : [];
  const shots: HeldOutShot[] = [];
  for (const g of groups.sort()) {
    for (const f of readdirSync(path.join(abs, g)).filter((x) => /\.(jpe?g|png)$/i.test(x)).sort()) {
      // Same pipeline as the demo photos: 720 px JPEG, then measure (which resizes to 360 px).
      const buf = await sharp(path.join(abs, g, f)).rotate().resize(720, 720, { fit: "inside" }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
      shots.push({ id: f.replace(/\.\w+$/, ""), setup: g, capture: await measure(buf) });
    }
  }
  if (shots.length < 2) {
    console.log(`
Held-out check: pending (no photos in ${dir}/<setup>/).`);
    return;
  }
  const t1 = heldOutTally(shots, 1);
  const t = heldOutTally(shots, 2);
  console.log(`
Held-out check (${shots.length} photos in ${t.setups.length} setups from ${dir}).`);
  console.log(`  ${heldOutSentenceV1(t1)}`);
  console.log(`  ${heldOutSentenceV2(t)}`);
  console.log("  Session4 showed why version 1 failed, so it informed version 2 and is not strictly held out for it. Limit values checked on sessions 1 to 3 only.");
  console.log("  Version 2 detail:");
  for (const g of t.setups) console.log(`  ${g}: ${HELD_OUT_SETUPS[g]?.note ?? "(no description in lib/heldout.ts)"}`);
  for (const s of shots) console.log(`  ${s.setup}/${s.id}  ${JSON.stringify(s.capture)}`);
  console.log("  Per setup pair (ordered pairs):");
  for (const [k, c] of Object.entries(t.byPair).sort()) console.log(`    ${k}: ${c.passed}/${c.total} pass  failing checks: ${failingText(c)}`);
  const line = (name: string, c: PairCount, want: "pass" | "block") =>
    console.log(`  ${name.padEnd(46)} ${want === "pass" ? `${c.passed}/${c.total} pass (${pctOf(c.passed, c.total)})` : `${c.total - c.passed}/${c.total} blocked (${pctOf(c.total - c.passed, c.total)})`}  failing: ${failingText(c)}`);
  line("same setup (expect pass):", t.sameSetup, "pass");
  line("different light (expect block):", t.differentLight, "block");
  line("same light, before vs after skincare (expect pass):", t.sameLightSkinChange, "pass");
  const stored = new Map((data.heldOut ?? []).map((p) => [p.id, p.capture]));
  const drift = shots.filter((s) => stored.has(s.id) && JSON.stringify(stored.get(s.id)) !== JSON.stringify(s.capture));
  if (stored.size) console.log(`  Stored held-out capture stats in data/scores.json ${drift.length ? `DIFFER for ${drift.map((d) => d.id).join(", ")}` : "match these measurements"}.`);
}

const argIdx = process.argv.indexOf("--heldout");
heldOut(argIdx > 0 ? process.argv[argIdx + 1] : "photos/session4").then(() => {
  if (!ok) {
    console.error("\nIn-sample calibration expectations broken.");
    process.exit(1);
  }
  console.log("\nIn-sample calibration OK.");
});
