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

export interface PairTally {
  /** Ordered pairs inside session1 (same spot, same light). All should pass. */
  sameLight: { total: number; passed: number };
  /** Ordered pairs with a different light or at least one backlit photo (any pair touching session2, plus s1 vs s3). All should be blocked. */
  changed: { total: number; blocked: number };
  /** Ordered pairs inside session3 (ceiling light, same spot). Not used for calibration; reported for completeness. */
  ceilingOnly: { total: number; passed: number };
}

export function pairTally(photos: DemoPhoto[]): PairTally {
  const t: PairTally = { sameLight: { total: 0, passed: 0 }, changed: { total: 0, blocked: 0 }, ceilingOnly: { total: 0, passed: 0 } };
  for (const a of photos)
    for (const b of photos) {
      if (a === b) continue;
      const ok = compareConditions(a.capture, b.capture).match;
      if (a.session === "s1" && b.session === "s1") {
        t.sameLight.total++;
        if (ok) t.sameLight.passed++;
      } else if (a.session === "s3" && b.session === "s3") {
        t.ceilingOnly.total++;
        if (ok) t.ceilingOnly.passed++;
      } else {
        t.changed.total++;
        if (!ok) t.changed.blocked++;
      }
    }
  return t;
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
  const P = data.photos;
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
