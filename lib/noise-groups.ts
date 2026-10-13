/**
 * Which photos the noise floor is computed from. Shared by scripts/gen-noise-model.ts, the page and the tests.
 *
 * Every group is a set of retakes at one spot under one light with nothing changed in between. The SD is pooled
 * within groups, so a lighting difference between groups never counts as noise.
 * Excluded: session2 (window behind the head; the capture check blocks every pair inside it, and backlight made pore
 * unstable), the duplicate submission of IMG_1406 (same file) and the virtual try-on photos (edited, not retakes).
 */
import type { DemoData, DemoPhoto } from "./demo-types";
import { HELD_OUT_SETUPS } from "./heldout";
import { buildNoiseModel, MDC_FACTOR, METRICS, sampleSd, type Metric, type NoiseModel } from "./noise";

export interface NoiseGroup {
  key: string;
  label: string;
  heldOut: boolean;
  photos: DemoPhoto[];
}

export function noiseGroups(data: DemoData): NoiseGroup[] {
  const s = (session: DemoPhoto["session"]) => data.photos.filter((p) => p.session === session);
  const groups: NoiseGroup[] = [
    { key: "s1", label: "Session 1, desk spot", heldOut: false, photos: s("s1") },
    { key: "s3", label: "Session 3, ceiling light (other room)", heldOut: false, photos: s("s3") },
  ];
  for (const [k, v] of Object.entries(HELD_OUT_SETUPS)) {
    const photos = (data.heldOut ?? []).filter((p) => p.setup === k);
    if (photos.length >= 2) groups.push({ key: `s4${k}`, label: `Session 4${k}, ${v.label.toLowerCase()}`, heldOut: true, photos });
  }
  return groups;
}

export function groupSamples(g: NoiseGroup): Record<Metric, number[]> {
  return Object.fromEntries(METRICS.map((m) => [m, g.photos.map((p) => p.scores[m]!.raw)])) as Record<Metric, number[]>;
}

/** Per-group SD of raw scores, rounded to 3 decimals, for the page and README table. */
export function groupSds(g: NoiseGroup): Record<Metric, number> {
  const s = groupSamples(g);
  return Object.fromEntries(METRICS.map((m) => [m, Math.round(sampleSd(s[m]) * 1000) / 1000])) as Record<Metric, number>;
}

/** Unordered pairs inside the given groups whose |Δraw| is past a floor, per metric. Used to show how tight a floor is. */
export function pairsPastFloor(groups: NoiseGroup[], floor: Record<Metric, number>): Record<Metric, { pairs: number; past: number }> {
  const out = {} as Record<Metric, { pairs: number; past: number }>;
  for (const m of METRICS) {
    let pairs = 0;
    let past = 0;
    for (const g of groups)
      for (let i = 0; i < g.photos.length; i++)
        for (let j = i + 1; j < g.photos.length; j++) {
          pairs++;
          if (Math.abs(g.photos[i].scores[m]!.raw - g.photos[j].scores[m]!.raw) > floor[m]) past++;
        }
    out[m] = { pairs, past };
  }
  return out;
}

/**
 * The shot that stands for its group in a demo case: the one whose four raw scores are closest to the group mean,
 * measured as the sum of squared differences divided by the pooled SD of each metric. Chosen on scores only, never on
 * capture stats or verdicts.
 */
export function representative(photos: DemoPhoto[], sd: Record<Metric, number>): DemoPhoto {
  const mu = Object.fromEntries(METRICS.map((m) => [m, photos.reduce((a, p) => a + p.scores[m]!.raw, 0) / photos.length])) as Record<Metric, number>;
  const dist = (p: DemoPhoto) => METRICS.reduce((a, m) => a + ((p.scores[m]!.raw - mu[m]) / sd[m]) ** 2, 0);
  return photos.reduce((best, p) => (dist(p) < dist(best) ? p : best));
}

/** Contents of data/noise-model.json, computed from data/scores.json. A test checks the shipped file matches. */
export function noiseModelFile(data: DemoData) {
  const groups = noiseGroups(data);
  const model: NoiseModel = buildNoiseModel(groups.map(groupSamples));
  const session1Only: NoiseModel = buildNoiseModel(groups.filter((g) => g.key === "s1").map(groupSamples));
  return {
    generatedBy: "scripts/gen-noise-model.ts",
    basis: `SD pooled within ${groups.length} same-setup groups (${groups.map((g) => `${g.key} n=${g.photos.length}`).join(", ")}), raw_score`,
    formula: `MDC95 = 1.96 * sqrt(2) * SD (= ${MDC_FACTOR.toFixed(4)} * SD)`,
    groups: groups.map((g) => ({ key: g.key, label: g.label, heldOut: g.heldOut, ids: g.photos.map((p) => p.id), sd: groupSds(g) })),
    session1Only,
    metrics: model,
  };
}

type NoiseFile = ReturnType<typeof noiseModelFile>;

/** The noise table as Markdown, quoted verbatim in the README (checked by tests/docs-consistency.test.ts). */
export function noiseMarkdown(f: NoiseFile, labels: Record<Metric, string>): string {
  const NL = String.fromCharCode(10);
  const cols = ["Metric", ...f.groups.map((g) => `SD ${g.key}`), "Pooled SD", "MDC95 pooled (used)", "MDC95 session 1 only (before)"];
  const head = `| ${cols.join(" | ")} |${NL}|${cols.map(() => "---").join("|")}|`;
  const body = METRICS.map(
    (m) => `| ${labels[m]} | ${f.groups.map((g) => g.sd[m].toFixed(2)).join(" | ")} | ${f.metrics[m].sd.toFixed(2)} | ${f.metrics[m].mdc95.toFixed(2)} | ${f.session1Only[m].mdc95.toFixed(2)} |`,
  ).join(NL);
  return `${head}${NL}${body}`;
}
