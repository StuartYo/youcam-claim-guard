/**
 * Headline numbers shown on the page and quoted in the README and docs.
 * Everything is computed from data/scores.json with one rounding rule, so the page and the docs can't drift.
 * tests/docs-consistency.test.ts checks that the README and docs quote these exact strings.
 */
import { compareConditions } from "./conditions";
import type { DemoData, DemoPhoto } from "./demo-types";
import { mean, type Metric } from "./noise";

/** One rounding rule everywhere: round half up to `d` decimals, then print with exactly `d` decimals. */
export function fix(v: number, d = 1): string {
  const f = 10 ** d;
  return (Math.round(v * f + 1e-9) / f).toFixed(d);
}

export type Session = DemoPhoto["session"];

export function sessionMean(photos: DemoPhoto[], session: Session, metric: Metric, scale: "ui" | "raw"): number {
  return mean(photos.filter((p) => p.session === session).map((p) => p.scores[metric]![scale]));
}

/** Sessions the limits were set on. Later sessions (held-out photos) never enter these numbers. */
export const IN_SAMPLE: ReadonlySet<Session> = new Set<Session>(["s1", "s2", "s3"]);

export interface PairTally {
  /** All ordered pairs of the in-sample photos. */
  total: number;
  /** Ordered pairs taken at the same spot under the same light, no backlight: desk spot (s1) and ceiling light (s3). All should pass. */
  sameSetup: { total: number; passed: number; desk: number; ceiling: number };
  /** Ordered pairs that cross setups, or sit inside the backlit window session (s2). All should be blocked. */
  changed: { total: number; blocked: number; acrossSetups: number; bothBacklit: number };
}

export function pairTally(all: DemoPhoto[]): PairTally {
  const photos = all.filter((p) => IN_SAMPLE.has(p.session));
  const t: PairTally = {
    total: 0,
    sameSetup: { total: 0, passed: 0, desk: 0, ceiling: 0 },
    changed: { total: 0, blocked: 0, acrossSetups: 0, bothBacklit: 0 },
  };
  for (const a of photos)
    for (const b of photos) {
      if (a === b) continue;
      t.total++;
      const ok = compareConditions(a.capture, b.capture).match;
      if (a.session === b.session && a.session !== "s2") {
        t.sameSetup.total++;
        if (a.session === "s1") t.sameSetup.desk++;
        else t.sameSetup.ceiling++;
        if (ok) t.sameSetup.passed++;
      } else {
        t.changed.total++;
        if (a.session === b.session) t.changed.bothBacklit++;
        else t.changed.acrossSetups++;
        if (!ok) t.changed.blocked++;
      }
    }
  return t;
}

/** One sentence for the page, README and docs, so the pair counts read the same everywhere. */
export function pairSentence(t: PairTally): string {
  return (
    `Of the ${t.total} ordered photo pairs, the ${t.sameSetup.total} taken at the same spot under the same light ` +
    `(${t.sameSetup.desk} desk spot, ${t.sameSetup.ceiling} ceiling light) all ${t.sameSetup.passed === t.sameSetup.total ? "pass" : `but ${t.sameSetup.total - t.sameSetup.passed} pass`}, ` +
    `and the ${t.changed.total} that cross setups or include a backlit window photo ` +
    `${t.changed.blocked === t.changed.total ? "are all blocked" : `are blocked in ${t.changed.blocked} cases`}.`
  );
}

export interface Headline {
  photoCount: number;
  ceilingMoistureUi: string;
  windowMoistureUi: string;
  ceilingMoistureRaw: string;
  windowMoistureRaw: string;
  /** Relative change of the mean moisture ui score, ceiling to window, in percent. */
  lampMoisturePct: string;
  pairs: PairTally;
}

export function headline(data: DemoData): Headline {
  const P = data.photos.filter((p) => IN_SAMPLE.has(p.session));
  const cu = sessionMean(P, "s3", "moisture", "ui");
  const wu = sessionMean(P, "s2", "moisture", "ui");
  return {
    photoCount: P.length,
    ceilingMoistureUi: fix(cu),
    windowMoistureUi: fix(wu),
    ceilingMoistureRaw: fix(sessionMean(P, "s3", "moisture", "raw")),
    windowMoistureRaw: fix(sessionMean(P, "s2", "moisture", "raw")),
    // Computed from the rounded means that are printed next to it, so a reader can redo the division.
    lampMoisturePct: fix(((Number(fix(wu)) - Number(fix(cu))) / Number(fix(cu))) * 100),
    pairs: pairTally(P),
  };
}

/** Mean of a held-out setup (photos/session4/<setup>), one decimal, same rounding rule. */
export function heldOutMean(data: DemoData, setup: string, metric: Metric, scale: "ui" | "raw"): string {
  const xs = (data.heldOut ?? []).filter((p) => p.setup === setup).map((p) => p.scores[metric]![scale]);
  if (!xs.length) throw new Error(`held-out setup ${setup} missing`);
  return fix(mean(xs));
}

export interface SameRoomHeadline {
  moistureCeilingUi: string;
  moistureLampUi: string;
  /** Relative change of the rounded mean moisture ui, ceiling to lamp, in percent. */
  moisturePct: string;
  wrinkleCeilingUi: string;
  wrinkleLampUi: string;
}

/** Held-out setup A (ceiling light) against B (desk lamp, phone re-positioned), group means. Null until session4 is imported. */
export function sameRoomHeadline(data: DemoData): SameRoomHeadline | null {
  const has = (s: string) => (data.heldOut ?? []).some((p) => p.setup === s);
  if (!has("A") || !has("B")) return null;
  const a = heldOutMean(data, "A", "moisture", "ui");
  const b = heldOutMean(data, "B", "moisture", "ui");
  return {
    moistureCeilingUi: a,
    moistureLampUi: b,
    moisturePct: fix(((Number(b) - Number(a)) / Number(a)) * 100),
    wrinkleCeilingUi: heldOutMean(data, "A", "wrinkle", "ui"),
    wrinkleLampUi: heldOutMean(data, "B", "wrinkle", "ui"),
  };
}
