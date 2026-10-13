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
  /** One sentence shown above the result. */
  summary: string;
  /** File names, timing and caveats, shown under a "Details" disclosure. */
  details: string[];
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

function makeCase(slug: string, title: string, summary: string, details: string[], beforeId: string, afterId: string, beforeNote: string, afterNote: string): DemoCase {
  const b = photo(beforeId);
  const a = photo(afterId);
  const conditions = compareConditions(b.capture, a.capture);
  return {
    slug,
    title,
    summary,
    details,
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
    summary: "The same file sent to the API twice came back with identical scores, so the jitter comes from the photo, not the API.",
    details: ["IMG_1406 (desk spot, session 1) was submitted a second time on the same day."],
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
    summary: "YouCam virtual foundation on an untouched selfie: radiance passes as an appearance claim, and moisture is blocked because foundation is makeup.",
    details: [
      `Before is IMG_1407 resized to the 1440 x 1920 file sent to YouCam virtual foundation. After is the try-on output.`,
      `Radiance moved past the noise floor, so it is allowed as an appearance claim: how the skin looks with ${CLAIM_POLICY[product].label.toLowerCase()} on. A moisture claim needs a moisture product, so moisture is blocked by claim type.`,
      `The after photo differs in more than the face: the try-on also brightened the background (luma ${bg(base.capture.borderLum)} to ${bg(sim.capture.borderLum)}), and the output went from PNG to JPEG while the before did not.`,
      `The skin was not treated, so this simulates a product effect. See docs/positive-control-2026-10-13.md.`,
    ],
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
  return makeCase(
    "same-room-lamp",
    l.title,
    "Same face, same room, no skincare: in a ceiling-light shot and a desk-lamp shot taken minutes apart (the phone was re-positioned), moisture and wrinkle score higher under the lamp.",
    [
      `Photos ${l.beforeId} (${l.beforeNote}) and ${l.afterId} (${l.afterNote}), taken on the same evening.`,
      "In the lamp photos the phone sits lower and tilts up, so the ceiling is in frame and the face is smaller. This is not a lamp-only change.",
      "The desk-lamp photos were taken a few minutes first (IMG_1431 to 1434, then IMG_1436 to 1439). The case orders them ceiling to lamp, the direction that would show a gain.",
      "Each held-out case uses the shot closest to its group's average scores, chosen on scores only.",
    ],
    l.beforeId,
    l.afterId,
    l.beforeNote,
    l.afterNote,
  );
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
  const radiance = evaluation.metrics.find((x) => x.metric === "radiance")!;
  const pore = evaluation.metrics.find((x) => x.metric === "pore")!;
  const failed = conditions.checks.filter((c) => !c.pass);
  return {
    slug: "moisturizer",
    title: "Real moisturizer, same lamp, 20 minutes",
    summary: `A real moisturizer under the same desk lamp: moisture moved ${fmtSigned(mo.deltaRaw)}, inside the noise floor, so there is no moisture badge.`,
    details: [
      `One person, one application of the developer's own moisturizer. Before is ${b.id}, after is ${a.id}, about 20 minutes later, similar framing.`,
      `Across the four shots on each side, average moisture went from ui ${mean("B", "moisture", "ui")} to ${mean("C", "moisture", "ui")} (raw ${mean("B", "moisture", "raw")} to ${mean("C", "moisture", "raw")}).`,
      `Pore rose (raw ${fmtSigned(pore.deltaRaw)}), but this policy does not let a moisturizer claim pore.`,
      `Radiance fell (raw ${fmtSigned(radiance.deltaRaw)}, past the ±${radiance.mdc95.toFixed(1)} floor). Claim Guard confirms the drop is larger than retake noise; an app would show it as a drop, not a gain.`,
      conditions.match
        ? "The capture check passes: same lamp, background colour and face-to-background brightness within the limits."
        : `The capture check blocked the pair although the lamp was the same: ${failed.map((c) => `${c.label.toLowerCase()} changed by ${(Math.abs(c.delta) * 100).toFixed(1)}%`).join(" and ")}.`,
      "This is one application after 20 minutes on one person. It says nothing about what the product does over weeks.",
    ],
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
    "Two selfies minutes apart at the same spot and light, with no skincare in between, and the app would still show a moisture gain.",
    ["IMG_1409 then IMG_1406, desk spot, session 1. Every score change is inside the noise of a retake."],
    "IMG_1409",
    "IMG_1406",
    "desk spot, first shot",
    "desk spot, minutes later, same light",
  ),
  makeCase(
    "room-window",
    "Different room and light: ceiling light to window",
    "A ceiling light in one room against a bright window in another: the API reports a large moisture gain.",
    ["IMG_1374 is under a ceiling light (wardrobe and air conditioner behind). IMG_1399 is in front of a bright window. Same face, same day, different room, framing and light."],
    "IMG_1374",
    "IMG_1399",
    "ceiling light",
    "window behind the head (backlit)",
  ),
  makeCase(
    "room-desk",
    "Different room and light: ceiling light to desk spot",
    "Different room and light, no backlight: the raw moisture jump passes the noise floor, and only the capture check catches the change of light.",
    ["IMG_1373 (ceiling light, session 3) and IMG_1406 (desk spot, session 1). Same face, same day."],
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
