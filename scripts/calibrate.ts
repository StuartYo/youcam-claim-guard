/**
 * Prints the calibration behind THRESHOLDS in lib/conditions.ts.
 * For each check: the largest difference seen inside one session (must pass) and the smallest
 * difference seen between sessions (should fail), then every photo pair through compareConditions.
 * Exits 1 if any required pass/fail expectation is broken.
 * Usage: npm run calibrate
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { compareConditions, THRESHOLDS, type CaptureStats } from "../lib/conditions";
import type { DemoData, DemoPhoto } from "../lib/demo-types";

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
if (!ok) {
  console.error("\nCalibration expectations broken.");
  process.exit(1);
}
console.log("\nCalibration OK.");
