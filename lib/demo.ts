import scoresJson from "../data/scores.json";
import noiseJson from "../data/noise-model.json";
import { compareConditions, type ConditionsResult } from "./conditions";
import type { DemoData, DemoPhoto } from "./demo-types";
import { evaluate, type Evaluation, type NoiseModel } from "./noise";

export const demoData = scoresJson as unknown as DemoData;
export const noiseModel = noiseJson.metrics as NoiseModel;
export const noiseBasis = noiseJson.basis;

export function photo(id: string): DemoPhoto {
  const p = demoData.photos.find((x) => x.id === id);
  if (!p) throw new Error(`unknown demo photo ${id}`);
  return p;
}

export interface CaseSide {
  id: string;
  image: string;
  caption: string;
}

export interface DemoCase {
  slug: string;
  title: string;
  summary: string;
  before: CaseSide;
  after: CaseSide;
  conditions: ConditionsResult;
  evaluation: Evaluation;
}

function side(p: DemoPhoto, note?: string): CaseSide {
  return { id: p.id, image: p.image, caption: `${p.id} · ${note ?? p.sessionLabel}` };
}

function makeCase(slug: string, title: string, summary: string, beforeId: string, afterId: string): DemoCase {
  const b = photo(beforeId);
  const a = photo(afterId);
  const conditions = compareConditions(b.capture, a.capture);
  return {
    slug,
    title,
    summary,
    before: side(b),
    after: side(a),
    conditions,
    evaluation: evaluate({ before: b.scores, after: a.scores, conditions, noise: noiseModel }),
  };
}

function identicalCase(): DemoCase {
  const p = photo("IMG_1406");
  const dup = demoData.duplicates.find((d) => d.id === "IMG_1406");
  if (!dup) throw new Error("duplicate result for IMG_1406 missing");
  const conditions = compareConditions(p.capture, p.capture);
  return {
    slug: "same-file",
    title: "Same file sent twice",
    summary: "IMG_1406 was submitted to the API a second time. The scores came back identical, so the API itself adds no jitter. The noise comes from the photo.",
    before: side(p, "first submission"),
    after: side(p, "second submission"),
    conditions,
    evaluation: evaluate({ before: p.scores, after: dup.scores, conditions, noise: noiseModel, identical: true }),
  };
}

/** Positive control: one session1 photo against the same photo with YouCam virtual foundation applied. */
function simulatedCase(): DemoCase {
  const sim = demoData.simulated?.find((x) => x.id === "IMG_1407_foundation1");
  if (!sim) throw new Error("simulated photo IMG_1407_foundation1 missing");
  const b = photo(sim.sourceId);
  const conditions = compareConditions(b.capture, sim.capture);
  return {
    slug: "real-change",
    title: "Real change (positive control)",
    summary:
      "The before photo is an untouched same-light selfie. The after photo is the same photo with YouCam virtual foundation applied, so the face changed and the light did not. The skin itself was not treated: this simulates a product effect. Moisture, radiance and pore move past the noise floor, so the badge goes through. The pore score went down, and Claim Guard reports that too.",
    before: side(b, "untouched, same light"),
    after: { id: sim.id, image: sim.image, caption: "same photo with YouCam virtual foundation applied (simulated product effect)" },
    conditions,
    evaluation: evaluate({ before: b.scores, after: sim.scores, conditions, noise: noiseModel }),
  };
}

export const demoCases: DemoCase[] = [
  makeCase(
    "same-light",
    "Same light, nothing changed",
    "Two selfies taken minutes apart at the same spot under the same light. No skincare in between. The app would still show a moisture gain.",
    "IMG_1409",
    "IMG_1406",
  ),
  makeCase(
    "lamp-window",
    "Only the lamp changed: ceiling to window",
    "Same face, same day. The before photo is under a ceiling light, the after photo is in front of a bright window. The API reports a large moisture gain.",
    "IMG_1374",
    "IMG_1399",
  ),
  makeCase(
    "lamp-desk",
    "Only the lamp changed: ceiling to desk spot",
    "No backlight this time. The raw moisture jump is larger than the noise floor, so a noise check alone would approve it. The capture check catches the different light.",
    "IMG_1373",
    "IMG_1406",
  ),
  identicalCase(),
  simulatedCase(),
];
