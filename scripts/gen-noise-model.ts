/**
 * data/scores.json -> data/noise-model.json
 * SD per metric from the session1 shots (same spot, same light, nothing changed). The duplicate
 * submission of IMG_1406 is excluded because it is the same file, not a new photo.
 * Usage: npm run data:noise
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildNoiseModel, METRICS, type Metric } from "../lib/noise";
import type { DemoData } from "../lib/demo-types";

const ROOT = path.resolve(__dirname, "..");

export function writeNoiseModel() {
  const data: DemoData = JSON.parse(readFileSync(path.join(ROOT, "data", "scores.json"), "utf-8"));
  const s1 = data.photos.filter((p) => p.session === "s1");
  const samples = {} as Record<Metric, number[]>;
  for (const m of METRICS) samples[m] = s1.map((p) => p.scores[m]!.raw);
  const model = buildNoiseModel(samples);
  const out = {
    generatedBy: "scripts/gen-noise-model.ts",
    basis: `session1: ${s1.length} photos (${s1.map((p) => p.id).join(", ")}), same spot and light, raw_score`,
    formula: "MDC95 = 1.96 * sqrt(2) * SD",
    metrics: model,
  };
  writeFileSync(path.join(ROOT, "data", "noise-model.json"), JSON.stringify(out, null, 1) + "\n");
  for (const m of METRICS) console.log(m.padEnd(9), `n=${model[m].n} sd=${model[m].sd} mdc95=${model[m].mdc95}`);
}

if (require.main === module) writeNoiseModel();
