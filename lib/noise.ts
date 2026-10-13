/**
 * Noise model. Repeated photos of an unchanged face under the same light give a per-metric SD on raw_score.
 * The minimum detectable change at 95% for the difference of two shots is MDC95 = 1.96 * sqrt(2) * SD.
 */
import type { ConditionsResult } from "./conditions";

export const METRICS = ["moisture", "pore", "wrinkle", "radiance"] as const;
export type Metric = (typeof METRICS)[number];

export const METRIC_LABEL: Record<Metric, string> = {
  moisture: "Moisture",
  pore: "Pore",
  wrinkle: "Wrinkle",
  radiance: "Radiance",
};

export interface Score {
  ui: number;
  raw: number;
}
export type Scores = Partial<Record<Metric, Score>>;

export interface MetricNoise {
  n: number;
  mean: number;
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

export function buildNoiseModel(samples: Record<Metric, number[]>): NoiseModel {
  const out = {} as NoiseModel;
  for (const m of METRICS) {
    const xs = samples[m];
    const sd = sampleSd(xs);
    out[m] = { n: xs.length, mean: round(mean(xs), 3), sd: round(sd, 3), mdc95: round(mdc95(sd), 3) };
  }
  return out;
}

export type Verdict = "claimable" | "within-noise" | "no-visible-change" | "blocked-conditions";

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
  reason: string;
}

export interface Evaluation {
  /** True when at least one metric is claimable. */
  badgeAllowed: boolean;
  identical: boolean;
  metrics: MetricVerdict[];
}

export function fmtSigned(v: number, d = 1): string {
  const s = Math.abs(v).toFixed(d);
  if (Number(s) === 0) return (0).toFixed(d);
  return v > 0 ? `+${s}` : `−${s}`;
}

export function badgeText(metric: Metric, deltaUiPct: number): string {
  const r = Math.round(deltaUiPct);
  return `${METRIC_LABEL[metric]} ${r > 0 ? "+" : r < 0 ? "−" : "±"}${Math.abs(r)}%`;
}

export interface EvaluateInput {
  before: Scores;
  after: Scores;
  conditions: ConditionsResult;
  noise: NoiseModel;
  /** True when both photos are byte-identical (same SHA-256). */
  identical?: boolean;
}

export function evaluate({ before, after, conditions, noise, identical = false }: EvaluateInput): Evaluation {
  const metrics: MetricVerdict[] = [];
  for (const m of METRICS) {
    const b = before[m];
    const a = after[m];
    if (!b || !a) continue;
    const deltaRaw = round(a.raw - b.raw, 3);
    const deltaUi = round(a.ui - b.ui, 3);
    const deltaUiPct = round((deltaUi / b.ui) * 100, 2);
    const mdc = noise[m].mdc95;
    let verdict: Verdict;
    let reason: string;
    if (identical) {
      verdict = "within-noise";
      reason = "Both photos are the same file, so nothing changed.";
    } else if (!conditions.match) {
      verdict = "blocked-conditions";
      reason = "The two photos were taken under different conditions, so the scores can't be compared.";
    } else if (Math.abs(deltaRaw) > mdc && Math.abs(deltaUi) < MIN_UI_CHANGE) {
      verdict = "no-visible-change";
      reason = `Raw score moved ${fmtSigned(deltaRaw)}, past the ±${mdc.toFixed(1)} floor, but the display score stayed at ${a.ui}. A badge would show no change, so there is nothing to claim.`;
    } else if (Math.abs(deltaRaw) > mdc) {
      verdict = "claimable";
      reason = `Raw score moved ${fmtSigned(deltaRaw)}, more than the ±${mdc.toFixed(1)} that same-light retakes produce.`;
    } else {
      verdict = "within-noise";
      reason = `Raw score moved ${fmtSigned(deltaRaw)}. Same-light retakes move up to ±${mdc.toFixed(1)}, so this can be noise.`;
    }
    metrics.push({ metric: m, verdict, before: b, after: a, deltaRaw, deltaUi, deltaUiPct, mdc95: mdc, aboveNoise: !identical && Math.abs(deltaRaw) > mdc, reason });
  }
  return { badgeAllowed: metrics.some((x) => x.verdict === "claimable"), identical, metrics };
}
