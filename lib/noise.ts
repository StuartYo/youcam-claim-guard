/**
 * Noise model. Repeated photos of an unchanged face under the same light give a per-metric SD on raw_score.
 * The SD is pooled over several same-setup groups (each group keeps its own mean, so a lighting difference between
 * groups does not count as noise). The minimum detectable change at 95% for the difference of two shots is
 * MDC95 = 1.96 * sqrt(2) * SD.
 */
import { claimKind, claimTypeReason, type ClaimKind, type ProductCategory } from "./claim-policy";
import type { ConditionsResult } from "./conditions";
import { BADGE_LABEL, METRIC_HINT, METRIC_LABEL, METRICS, type Metric } from "./metrics";

export { BADGE_LABEL, METRIC_HINT, METRIC_LABEL, METRICS, type Metric };

export interface Score {
  ui: number;
  raw: number;
}
export type Scores = Partial<Record<Metric, Score>>;

export interface MetricNoise {
  /** Photos behind the SD. */
  n: number;
  /** Degrees of freedom: photos minus groups. */
  df: number;
  sd: number;
  mdc95: number;
}
export type NoiseModel = Record<Metric, MetricNoise>;

export const MDC_FACTOR = 1.96 * Math.SQRT2;

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample standard deviation (n - 1). */
export function sampleSd(xs: number[]): number {
  if (xs.length < 2) throw new Error("need at least 2 values for an SD");
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export function mdc95(sd: number): number {
  return MDC_FACTOR * sd;
}

/** Pooled within-group SD: sqrt( sum((n_i - 1) * sd_i^2) / sum(n_i - 1) ). Each group keeps its own mean. */
export function pooledSd(groups: number[][]): number {
  let num = 0;
  let den = 0;
  for (const xs of groups) {
    if (xs.length < 2) continue;
    num += (xs.length - 1) * sampleSd(xs) ** 2;
    den += xs.length - 1;
  }
  if (!den) throw new Error("need at least one group with 2 values");
  return Math.sqrt(num / den);
}

/** Noise model from one or more same-setup groups. With a single group this is the plain sample SD. */
export function buildNoiseModel(groups: Array<Record<Metric, number[]>>): NoiseModel {
  const out = {} as NoiseModel;
  for (const m of METRICS) {
    const gs = groups.map((g) => g[m]).filter((xs) => xs.length >= 2);
    const sd = pooledSd(gs);
    const n = gs.reduce((a, xs) => a + xs.length, 0);
    out[m] = { n, df: n - gs.length, sd: round(sd, 3), mdc95: round(mdc95(sd), 3) };
  }
  return out;
}

export type Verdict = "claimable" | "within-noise" | "no-visible-change" | "blocked-conditions" | "blocked-claim-type";

/** The badge reports the ui_score change, so a claim also needs the display score to move by at least this much. */
export const MIN_UI_CHANGE = 1;

export interface MetricVerdict {
  metric: Metric;
  verdict: Verdict;
  before: Score;
  after: Score;
  /** after.raw - before.raw */
  deltaRaw: number;
  /** Relative change of the display score in percent. This is what a badge would show. */
  deltaUiPct: number;
  mdc95: number;
  /** after.ui - before.ui */
  deltaUi: number;
  /** |deltaRaw| > MDC95, regardless of capture conditions. Shows what a noise-only check would decide. */
  aboveNoise: boolean;
  /** Set when a product category was given: "skin", "appearance", or null when the category may not claim this metric. */
  claimKind?: ClaimKind | null;
  reason: string;
}

export interface Evaluation {
  /** True when at least one metric is claimable. */
  badgeAllowed: boolean;
  identical: boolean;
  /** The product category the claim is about, when given. */
  product?: ProductCategory;
  metrics: MetricVerdict[];
}

export function fmtSigned(v: number, d = 1): string {
  const s = Math.abs(v).toFixed(d);
  if (Number(s) === 0) return (0).toFixed(d);
  return v > 0 ? `+${s}` : `−${s}`;
}

/** One rounding rule for every percent shown next to a badge: whole percent, half away from zero (−2.5% shows as −3%). */
export function roundPct(deltaUiPct: number): number {
  return Math.sign(deltaUiPct) * Math.round(Math.abs(deltaUiPct) + 1e-9);
}

export function pctText(deltaUiPct: number): string {
  const r = roundPct(deltaUiPct);
  return `${r > 0 ? "+" : r < 0 ? "−" : "±"}${Math.abs(r)}%`;
}

export function badgeText(metric: Metric, deltaUiPct: number): string {
  return `${BADGE_LABEL[metric]} ${pctText(deltaUiPct)}`;
}

export interface EvaluateInput {
  before: Scores;
  after: Scores;
  conditions: ConditionsResult;
  noise: NoiseModel;
  /** True when both photos are byte-identical (same SHA-256). */
  identical?: boolean;
  /** Product category behind the claim. When given, metrics the category may not claim are blocked (see lib/claim-policy.ts). */
  product?: ProductCategory;
}

/** A badge is an improvement claim: the change must be claimable and the display score must go up. */
export const isGainBadge = (m: MetricVerdict) => m.verdict === "claimable" && m.deltaUi > 0;

export function evaluate({ before, after, conditions, noise, identical = false, product }: EvaluateInput): Evaluation {
  const metrics: MetricVerdict[] = [];
  for (const m of METRICS) {
    const b = before[m];
    const a = after[m];
    if (!b || !a) continue;
    const deltaRaw = round(a.raw - b.raw, 3);
    const deltaUi = round(a.ui - b.ui, 3);
    const deltaUiPct = round((deltaUi / b.ui) * 100, 2);
    const mdc = noise[m].mdc95;
    const kind = product ? claimKind(product, m) : undefined;
    let verdict: Verdict;
    let reason: string;
    if (identical) {
      verdict = "within-noise";
      reason = "Both photos are the same file, so nothing changed.";
    } else if (product && kind === null) {
      verdict = "blocked-claim-type";
      reason = claimTypeReason(product, m);
    } else if (!conditions.match) {
      verdict = "blocked-conditions";
      reason = "The two photos were taken under different conditions, so the scores can't be compared.";
    } else if (Math.abs(deltaRaw) > mdc && Math.abs(deltaUi) < MIN_UI_CHANGE) {
      verdict = "no-visible-change";
      reason = `Raw score moved ${fmtSigned(deltaRaw)}, past the ±${mdc.toFixed(1)} floor, but the display score stayed at ${a.ui}. A badge would show no change, so there is nothing to claim.`;
    } else if (Math.abs(deltaRaw) > mdc) {
      verdict = "claimable";
      reason = `Raw score moved ${fmtSigned(deltaRaw)}, more than the ±${mdc.toFixed(1)} that same-light retakes produce.`;
      if (deltaUi < 0) reason += " This is a real drop, not a gain, so there is no improvement badge.";
      else if (kind === "appearance") reason += " This is an appearance claim: it describes the skin with the product on.";
    } else {
      verdict = "within-noise";
      reason = `Raw score moved ${fmtSigned(deltaRaw)}. Same-light retakes stay within about ±${mdc.toFixed(1)} (95% band), so this can be noise.`;
    }
    metrics.push({ metric: m, verdict, before: b, after: a, deltaRaw, deltaUi, deltaUiPct, mdc95: mdc, aboveNoise: !identical && Math.abs(deltaRaw) > mdc, ...(product ? { claimKind: kind } : {}), reason });
  }
  return { badgeAllowed: metrics.some(isGainBadge), identical, ...(product ? { product } : {}), metrics };
}
