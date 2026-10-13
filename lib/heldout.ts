/**
 * Held-out photos (session4, taken 2026-10-13 evening, after the capture limits were frozen).
 * The capture limits in lib/conditions.ts were NOT re-tuned on these photos. They are used for two things:
 *   1. A held-out test of the capture check (this file: heldOutTally).
 *   2. Extra same-setup groups for the pooled noise floor (scripts/gen-noise-model.ts).
 *
 * Folders under photos/session4/ are setups. `light` names the capture condition: setups with the same `light`
 * share lamp and framing, so the capture check should pass between them. B and C share the desk lamp; C differs
 * only in skin (after washing the face and applying a moisturizer), not in light.
 */
import { compareConditions, type CaptureStats } from "./conditions";

export interface HeldOutSetup {
  label: string;
  light: "ceiling" | "lamp";
  /** What the photos show, as checked by looking at them. */
  note: string;
}

export const HELD_OUT_SETUPS: Record<string, HeldOutSetup> = {
  A: {
    label: "Ceiling light",
    light: "ceiling",
    note: "Ceiling light only. Phone held closer: the face is larger in frame and no ceiling is visible.",
  },
  B: {
    label: "Desk lamp",
    light: "lamp",
    note: "Same room, desk lamp instead of the ceiling light. Phone re-positioned lower and tilted up: the ceiling is in frame and the face is smaller.",
  },
  C: {
    label: "Desk lamp, after moisturizer",
    light: "lamp",
    note: "Same desk lamp as B, similar framing (a little less ceiling in frame), about 20 minutes after washing the face and applying a moisturizer.",
  },
};

export interface HeldOutShot {
  id: string;
  setup: string;
  capture: CaptureStats;
}

export interface PairCount {
  total: number;
  passed: number;
  /** Failed check label -> number of pairs it failed in. */
  failing: Record<string, number>;
}

export interface HeldOutTally {
  photos: number;
  setups: string[];
  /** Ordered pairs inside one setup folder (A-A, B-B, C-C). Expected: pass. */
  sameSetup: PairCount;
  /** Ordered pairs across setups with different light (A-B, A-C, both directions). Expected: blocked. */
  differentLight: PairCount;
  /** Ordered pairs across setups with the same light but a skin change between them (B-C). Expected: pass, since the light is the same. */
  sameLightSkinChange: PairCount;
  /** Per ordered setup pair, e.g. "A-B". */
  byPair: Record<string, PairCount>;
}

const empty = (): PairCount => ({ total: 0, passed: 0, failing: {} });

function add(c: PairCount, a: CaptureStats, b: CaptureStats) {
  const r = compareConditions(a, b);
  c.total++;
  if (r.match) c.passed++;
  else for (const k of r.checks.filter((x) => !x.pass)) c.failing[k.label] = (c.failing[k.label] ?? 0) + 1;
}

export function heldOutTally(shots: HeldOutShot[]): HeldOutTally {
  const t: HeldOutTally = {
    photos: shots.length,
    setups: [...new Set(shots.map((s) => s.setup))].sort(),
    sameSetup: empty(),
    differentLight: empty(),
    sameLightSkinChange: empty(),
    byPair: {},
  };
  for (const a of shots)
    for (const b of shots) {
      if (a === b) continue;
      const key = [a.setup, b.setup].sort().join("-");
      t.byPair[key] ??= empty();
      add(t.byPair[key], a.capture, b.capture);
      const la = HELD_OUT_SETUPS[a.setup]?.light ?? a.setup;
      const lb = HELD_OUT_SETUPS[b.setup]?.light ?? b.setup;
      if (a.setup === b.setup) add(t.sameSetup, a.capture, b.capture);
      else if (la !== lb) add(t.differentLight, a.capture, b.capture);
      else add(t.sameLightSkinChange, a.capture, b.capture);
    }
  return t;
}

export const pctOf = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : "n/a");

/** "Face brightness 4" style list of failing checks. */
export function failingText(c: PairCount): string {
  const e = Object.entries(c.failing).sort((x, y) => y[1] - x[1]);
  return e.length ? e.map(([k, v]) => `${k.toLowerCase()} ${v}`).join(", ") : "none";
}

/** "light colour in 15, face brightness in 7" */
const inText = (c: PairCount) =>
  Object.entries(c.failing)
    .sort((x, y) => y[1] - x[1])
    .map(([k, v]) => `${k.toLowerCase()} in ${v}`)
    .join(", ");

/** One paragraph for the page, README and docs, so the held-out numbers read the same everywhere. */
export function heldOutSentence(t: HeldOutTally): string {
  const s = t.sameSetup;
  const d = t.differentLight;
  const k = t.sameLightSkinChange;
  const failedIn = Object.entries(t.byPair)
    .filter(([key, c]) => key[0] === key[2] && c.passed < c.total)
    .map(([key]) => `${key[0]} (${(HELD_OUT_SETUPS[key[0]]?.label ?? key[0]).toLowerCase()})`);
  const sameFail = s.total - s.passed;
  return (
    `On ${t.photos} held-out photos from a different evening, with the limits frozen: ${s.passed} of ${s.total} same-setup pairs pass (${pctOf(s.passed, s.total)})` +
    `${sameFail ? `; the ${sameFail} failures are all in setup ${failedIn.join(" and ")}, on ${inText(s).replace(/ in \d+/g, "")}` : ""}. ` +
    `${d.total - d.passed} of ${d.total} pairs with different light are blocked (${pctOf(d.total - d.passed, d.total)}). ` +
    `Between the desk-lamp photos before and after moisturizer (same lamp), only ${k.passed} of ${k.total} pairs pass (${pctOf(k.passed, k.total)}); the others fail on ${inText(k)}.`
  );
}
