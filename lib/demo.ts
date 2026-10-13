import scoresJson from "../data/scores.json";
import noiseJson from "../data/noise-model.json";
import { CLAIM_POLICY, type ProductCategory } from "./claim-policy";
import { compareConditions, type ConditionsResult } from "./conditions";
import type { DemoData, DemoPhoto } from "./demo-types";
import { evaluate, fmtSigned, METRICS, type Evaluation, type Metric, type NoiseModel } from "./noise";
import { representative } from "./noise-groups";
import { fix } from "./summary";

export const demoData = scoresJson as unknown as DemoData;
export const noiseModel = noiseJson.metrics as NoiseModel;
export const noiseBasis = noiseJson.basis;

export function photo(id: string): DemoPhoto {
  const p = [...demoData.photos, ...(demoData.heldOut ?? [])].find((x) => x.id === id);
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
  /** Product category the claim is about, when the case has one. */
  product?: ProductCategory;
}

export { caseVerdict, type CaseTone } from "./case-verdict";

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
 * Positive control: the file sent to YouCam virtual foundation (IMG_1407 resized to 1440 x 1920) against the try-on output.
 * The product is foundation, which is makeup, so only appearance claims are allowed (see lib/claim-policy.ts).
 */
function simulatedCase(): DemoCase {
  const sim = demoData.simulated?.find((x) => x.id === "IMG_1407_foundation1");
  if (!sim) throw new Error("simulated photo IMG_1407_foundation1 missing");
  const base = demoData.baselines?.find((x) => x.id === sim.baselineId);
  if (!base) throw new Error(`baseline ${sim.baselineId} missing`);
  const conditions = compareConditions(base.capture, sim.capture);
  const product: ProductCategory = "foundation";
  const bg = (v: number) => Math.round(v);
  return {
    slug: "real-change",
    title: "Virtual foundation (positive control)",
    summary:
      `Before is an untouched desk-spot selfie, resized to the 1440 x 1920 file sent to YouCam virtual foundation. After is the try-on output. ` +
      `The product is ${CLAIM_POLICY[product].label.toLowerCase()}, which is makeup. Radiance moved past the noise floor, so it is allowed as an appearance claim: how the skin looks with foundation on. ` +
      `Moisture moved too, but a moisture claim needs a moisture product, so it is blocked by claim type. ` +
      `The after photo differs in more than the face: the try-on also brightened the background (luma ${bg(base.capture.borderLum)} to ${bg(sim.capture.borderLum)}), and the output went from PNG to JPEG while the before did not. ` +
      `The skin was not treated, so this simulates a product effect.`,
    before: { id: base.id, image: base.image, caption: `${base.id} · untouched, resized like the try-on input` },
    after: { id: sim.id, image: sim.image, caption: `${sim.id} · YouCam virtual foundation output, PNG converted to JPEG (simulated product effect)` },
    conditions,
    evaluation: evaluate({ before: base.scores, after: sim.scores, conditions, noise: noiseModel, product }),
    product,
  };
}

/** Representative shot of a held-out setup (lib/noise-groups.ts: closest to the group mean on raw scores). */
export function heldOutRep(setup: string): DemoPhoto {
  const photos = (demoData.heldOut ?? []).filter((p) => p.setup === setup);
  if (photos.length < 2) throw new Error(`held-out setup ${setup} missing`);
  const sd = Object.fromEntries(METRICS.map((m) => [m, noiseModel[m].sd])) as Record<Metric, number>;
  return representative(photos, sd);
}

/** Headline hook: a held-out pair where the lamp changed (photos/session4/lamp-only.json). Title and summary come with the data. */
function lampOnlyCase(): DemoCase | null {
  const l = demoData.lampOnly;
  if (!l) return null;
  return makeCase("same-room-lamp", l.title, l.summary, l.beforeId, l.afterId, l.beforeNote, l.afterNote);
}

/**
 * A real moisturizer, same desk lamp: held-out setup B (before) against C (about 20 minutes after washing the face and
 * applying a moisturizer). One application, one person. Runs with product_category "moisturizer".
 */
function moisturizerCase(): DemoCase | null {
  const held = demoData.heldOut ?? [];
  if (!held.some((p) => p.setup === "B") || !held.some((p) => p.setup === "C")) return null;
  const b = heldOutRep("B");
  const a = heldOutRep("C");
  const product: ProductCategory = "moisturizer";
  const conditions = compareConditions(b.capture, a.capture);
  const evaluation = evaluate({ before: b.scores, after: a.scores, conditions, noise: noiseModel, product });
  const mean = (setup: string, m: Metric, k: "ui" | "raw") => fix(held.filter((p) => p.setup === setup).reduce((x, p) => x + p.scores[m]![k], 0) / held.filter((p) => p.setup === setup).length);
  const mo = evaluation.metrics.find((x) => x.metric === "moisture")!;
  return {
    slug: "moisturizer",
    title: "Real moisturizer, same lamp, 20 minutes",
    summary:
      `One person, one application of a real moisturizer (the developer's own product), photos about 20 minutes later under the same desk lamp with similar framing. ` +
      `Across the four shots on each side, average moisture went from ui ${mean("B", "moisture", "ui")} to ${mean("C", "moisture", "ui")} (raw ${mean("B", "moisture", "raw")} to ${mean("C", "moisture", "raw")}). ` +
      `In this pair raw moisture moved ${fmtSigned(mo.deltaRaw)}, inside the ±${mo.mdc95.toFixed(1)} floor, so there is no moisture result to show even before the capture check. ` +
      `Pore rose and radiance fell. This policy does not let a moisturizer claim pore. ` +
      (conditions.match
        ? ""
        : `The capture check also blocked the pair although the lamp was the same: ${conditions.checks
            .filter((c) => !c.pass)
            .map((c) => `${c.label.toLowerCase()} changed by ${(Math.abs(c.delta) * 100).toFixed(1)}% (limit ${(c.threshold * 100).toFixed(0)}%)`)
            .join(" and ")}. `) +
      `This says nothing about what the product does over weeks.`,
    before: side(b, "desk lamp, before washing and moisturizer"),
    after: side(a, "same lamp, about 20 minutes after moisturizer"),
    conditions,
    evaluation,
    product,
  };
}

const lampOnly = lampOnlyCase();
const moisturizer = moisturizerCase();

export const demoCases: DemoCase[] = [
  ...(lampOnly ? [lampOnly] : []),
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
    "room-window",
    "Different room and light: ceiling light to window",
    "Same face, same day, but a different room, framing and light. The before photo is under a ceiling light (wardrobe and air conditioner behind), the after photo is in front of a bright window. The API reports a large moisture gain.",
    "IMG_1374",
    "IMG_1399",
    "ceiling light",
    "window behind the head (backlit)",
  ),
  makeCase(
    "room-desk",
    "Different room and light: ceiling light to desk spot",
    "Same face, same day, different room and light, no backlight. The raw moisture jump is larger than the noise floor, so a noise check alone would approve it. The capture check catches the different light.",
    "IMG_1373",
    "IMG_1406",
    "ceiling light",
    "desk spot, different light from the ceiling shot",
  ),
  identicalCase(),
  ...(moisturizer ? [moisturizer] : []),
  simulatedCase(),
];

/** The case the hero shows: the held-out same-room lamp pair when it exists, otherwise the different-room desk-spot case. */
export const HEADLINE_SLUG = lampOnly ? "same-room-lamp" : "room-desk";

export function getCase(slug: string): DemoCase {
  const c = demoCases.find((x) => x.slug === slug);
  if (!c) throw new Error(`case ${slug} missing`);
  return c;
}
