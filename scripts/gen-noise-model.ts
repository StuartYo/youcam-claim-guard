/**
 * data/scores.json -> data/noise-model.json
 * SD per metric pooled within five same-setup groups (lib/noise-groups.ts): session1 desk spot, session3 ceiling light,
 * and the held-out session4 A, B and C. Until 2026-10-13 evening the floor came from session1 alone; the held-out
 * photos showed that was too tight (see docs/noise-floor-2026-10-13.md).
 * Usage: npm run data:noise
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { METRICS } from "../lib/noise";
import { noiseModelFile } from "../lib/noise-groups";
import type { DemoData } from "../lib/demo-types";

const ROOT = path.resolve(__dirname, "..");

export function writeNoiseModel() {
  const data: DemoData = JSON.parse(readFileSync(path.join(ROOT, "data", "scores.json"), "utf-8"));
  const out = noiseModelFile(data);
  writeFileSync(path.join(ROOT, "data", "noise-model.json"), JSON.stringify(out, null, 1) + "\n");
  for (const m of METRICS)
    console.log(m.padEnd(9), `n=${out.metrics[m].n} df=${out.metrics[m].df} sd=${out.metrics[m].sd} mdc95=${out.metrics[m].mdc95} (session1 only: ${out.session1Only[m].mdc95})`);
}

if (require.main === module) writeNoiseModel();
