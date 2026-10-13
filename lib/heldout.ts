/**
 * Held-out photos (session4, taken 2026-10-13 evening, after the version 1 capture limits were frozen).
 * They are used for three things:
 *   1. A held-out test of the version 1 capture check (heldOutTally with compareConditionsV1). Strictly held out.
 *   2. The same tally for the version 2 check. Session4 showed why version 1 failed (it read a redder face as warmer
 *      light), so it informed the version 2 design and is no longer strictly held out for it. The limit values were
 *      checked on sessions 1 to 3 only and not tuned on session4.
 *   3. Extra same-setup groups for the pooled noise floor (scripts/gen-noise-model.ts).
 *
 * Folders under photos/session4/ are setups. `light` names the capture condition: setups with the same `light`
 * share lamp and framing, so the capture check should pass between them. B and C share the desk lamp; C differs
 * only in skin (after washing the face and applying a moisturizer), not in light.
 */
import { compareConditions, compareConditionsV1, type CaptureStats, type ConditionsResult } from "./conditions";

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

type Compare = (a: CaptureStats, b: CaptureStats) => ConditionsResult;

function add(c: PairCount, a: CaptureStats, b: CaptureStats, compare: Compare) {
  const r = compare(a, b);
  c.total++;
  if (r.match) c.passed++;
  else for (const k of r.checks.filter((x) => !x.pass)) c.failing[k.label] = (c.failing[k.label] ?? 0) + 1;
}

/** Pair counts for the held-out photos. `version` 2 is the current check, 1 the frozen original. */
export function heldOutTally(shots: HeldOutShot[], version: 1 | 2 = 2): HeldOutTally {
  const compare: Compare = version === 1 ? compareConditionsV1 : compareConditions;
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
      add(t.byPair[key], a.capture, b.capture, compare);
      const la = HELD_OUT_SETUPS[a.setup]?.light ?? a.setup;
      const lb = HELD_OUT_SETUPS[b.setup]?.light ?? b.setup;
      if (a.setup === b.setup) add(t.sameSetup, a.capture, b.capture, compare);
      else if (la !== lb) add(t.differentLight, a.capture, b.capture, compare);
      else add(t.sameLightSkinChange, a.capture, b.capture, compare);
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

function tallyText(t: HeldOutTally): string {
  const s = t.sameSetup;
  const d = t.differentLight;
  const k = t.sameLightSkinChange;
  const failedIn = Object.entries(t.byPair)
    .filter(([key, c]) => key[0] === key[2] && c.passed < c.total)
    .map(([key]) => `${key[0]} (${(HELD_OUT_SETUPS[key[0]]?.label ?? key[0]).toLowerCase()})`);
  const sameFail = s.total - s.passed;
  return (
    `${s.passed} of ${s.total} same-setup pairs pass (${pctOf(s.passed, s.total)})` +
    `${sameFail ? `; the ${sameFail} failures are all in setup ${failedIn.join(" and ")}, on ${inText(s).replace(/ in \d+/g, "")}` : ""}. ` +
    `${d.total - d.passed} of ${d.total} pairs with different light are blocked (${pctOf(d.total - d.passed, d.total)}). ` +
    `Same lamp, before and after moisturizer: ${k.passed} of ${k.total} pairs pass (${pctOf(k.passed, k.total)})` +
    `${k.passed < k.total ? `; the others fail on ${inText(k)}` : ""}.`
  );
}

/** Version 1 numbers: the strict held-out result. Quoted on the page, README and docs. */
export function heldOutSentenceV1(t: HeldOutTally): string {
  return `Before the change (version 1, limits frozen from sessions 1 to 3, ${t.photos} held-out photos): ${tallyText(t)}`;
}

/** Version 2 numbers. Session4 informed the design change, so these are not a strict held-out result. */
export function heldOutSentenceV2(t: HeldOutTally): string {
  return `After the change (version 2, same ${t.photos} photos, no longer strictly held out): ${tallyText(t)}`;
}
