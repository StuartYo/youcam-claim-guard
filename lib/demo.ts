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

function side(p: DemoPhoto, note: string): CaseSide {
  return { id: p.id, image: p.image, caption: `${p.id} · ${note}` };
}

function makeCase(slug: string, title: string, summary: string, beforeId: string, afterId: string, beforeNote: string, afterNote: string): DemoCase {
  const b = photo(beforeId);
  const a = photo(afterId);
  const conditions = compareConditions(b.capture, a.capture);
  return {
    slug,
    title,
    summary,
    before: side(b, beforeNote),
    after: side(a, afterNote),
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

/**
 * Positive control: the exact file sent to YouCam virtual foundation (IMG_1407 resized to 1440 x 1920) against the try-on output.
 * Both sides went through the same resize, so only the foundation differs.
 */
function simulatedCase(): DemoCase {
  const sim = demoData.simulated?.find((x) => x.id === "IMG_1407_foundation1");
  if (!sim) throw new Error("simulated photo IMG_1407_foundation1 missing");
  const base = demoData.baselines?.find((x) => x.id === sim.baselineId);
  if (!base) throw new Error(`baseline ${sim.baselineId} missing`);
  const conditions = compareConditions(base.capture, sim.capture);
  return {
    slug: "real-change",
    title: "Real change (positive control)",
    summary:
      "Before is an untouched desk-spot selfie, resized to the 1440 x 1920 file that went to YouCam virtual foundation. After is the try-on output. Same file, same resize, same light: only the face changed. The skin itself was not treated, so this simulates a product effect. Moisture and radiance move past the noise floor and the badge goes through for those two. Pore and wrinkle stay back.",
    before: { id: base.id, image: base.image, caption: `${base.id} · untouched, resized like the try-on input` },
    after: { id: sim.id, image: sim.image, caption: `${sim.id} · same file with YouCam virtual foundation (simulated product effect)` },
    conditions,
    evaluation: evaluate({ before: base.scores, after: sim.scores, conditions, noise: noiseModel }),
  };
}

export const demoCases: DemoCase[] = [
  makeCase(
    "same-light",
    "Same light, nothing changed",
    "Two selfies taken minutes apart at the desk spot under the same light. No skincare in between. The app would still show a moisture gain.",
    "IMG_1409",
    "IMG_1406",
    "desk spot, first shot",
    "desk spot, minutes later, same light",
  ),
  makeCase(
    "lamp-window",
    "Only the lamp changed: ceiling to window",
    "Same face, same day. The before photo is under a ceiling light, the after photo is in front of a bright window. The API reports a large moisture gain.",
    "IMG_1374",
    "IMG_1399",
    "ceiling light",
    "window behind the head (backlit)",
  ),
  makeCase(
    "lamp-desk",
    "Only the lamp changed: ceiling to desk spot",
    "No backlight this time. The raw moisture jump is larger than the noise floor, so a noise check alone would approve it. The capture check catches the different light.",
    "IMG_1373",
    "IMG_1406",
    "ceiling light",
    "desk spot, different light from the ceiling shot",
  ),
  identicalCase(),
  simulatedCase(),
];
