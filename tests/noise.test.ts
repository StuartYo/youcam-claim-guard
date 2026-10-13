import { describe, expect, it } from "vitest";
import scores from "../data/scores.json";
import noiseJson from "../data/noise-model.json";
import { compareConditions, type CaptureStats } from "../lib/conditions";
import type { DemoData } from "../lib/demo-types";
import { badgeText, buildNoiseModel, evaluate, mdc95, METRICS, sampleSd, type Metric, type NoiseModel } from "../lib/noise";

const data = scores as unknown as DemoData;
const noise = noiseJson.metrics as NoiseModel;
const p = (id: string) => data.photos.find((x) => x.id === id)!;
const sameLight: CaptureStats = { centerLum: 105, borderLum: 212, backlightRatio: 0.5, clippedBorder: 0, redBlue: 1.6 };
const match = compareConditions(sameLight, sameLight);

describe("noise model", () => {
  it("MDC95 is 1.96 * sqrt(2) * SD", () => {
    expect(mdc95(1)).toBeCloseTo(2.7719, 4);
    expect(sampleSd([1, 2, 3, 4])).toBeCloseTo(1.2910, 4);
  });

  it("regenerating from session1 reproduces the shipped noise-model.json", () => {
    const s1 = data.photos.filter((x) => x.session === "s1");
    expect(s1).toHaveLength(6);
    const samples = Object.fromEntries(METRICS.map((m) => [m, s1.map((x) => x.scores[m]!.raw)])) as Record<Metric, number[]>;
    expect(buildNoiseModel(samples)).toEqual(noise);
  });

  it("matches the documented noise floor (moisture 5.1, pore 2.9, radiance 3.4)", () => {
    expect(noise.moisture.mdc95).toBeCloseTo(5.1, 1);
    expect(noise.pore.mdc95).toBeCloseTo(2.9, 1);
    expect(noise.radiance.mdc95).toBeCloseTo(3.4, 1);
  });
});

describe("evaluate", () => {
  it("within noise: two same-light session1 shots", () => {
    const ev = evaluate({ before: p("IMG_1409").scores, after: p("IMG_1406").scores, conditions: match, noise });
    const m = ev.metrics.find((x) => x.metric === "moisture")!;
    expect(m.deltaUiPct).toBeGreaterThan(0); // the app would show a gain...
    expect(m.verdict).toBe("within-noise"); // ...that same-light retakes can produce
    expect(Math.abs(m.deltaRaw)).toBeLessThan(m.mdc95);
    expect(ev.badgeAllowed).toBe(false);
  });

  it("above noise: raw change larger than MDC with matching conditions is claimable", () => {
    const before = { moisture: { ui: 75, raw: 65 } };
    const after = { moisture: { ui: 79, raw: 65 + noise.moisture.mdc95 + 0.5 } };
    const ev = evaluate({ before, after, conditions: match, noise });
    expect(ev.metrics[0].verdict).toBe("claimable");
    expect(ev.badgeAllowed).toBe(true);
    expect(badgeText("moisture", ev.metrics[0].deltaUiPct)).toBe("Moisture +5%");
  });

  it("change exactly at MDC is still within noise", () => {
    const before = { pore: { ui: 72, raw: 61 } };
    const after = { pore: { ui: 73, raw: 61 + noise.pore.mdc95 } };
    expect(evaluate({ before, after, conditions: match, noise }).metrics[0].verdict).toBe("within-noise");
  });

  it("conditions mismatch: lamp change blocks every metric even when raw moved past MDC", () => {
    const b = p("IMG_1373"); // ceiling light
    const a = p("IMG_1406"); // desk spot
    const conditions = compareConditions(b.capture, a.capture);
    expect(conditions.match).toBe(false);
    const ev = evaluate({ before: b.scores, after: a.scores, conditions, noise });
    const m = ev.metrics.find((x) => x.metric === "moisture")!;
    expect(m.aboveNoise).toBe(true);
    expect(m.verdict).toBe("blocked-conditions");
    expect(ev.metrics.every((x) => x.verdict === "blocked-conditions")).toBe(true);
    expect(ev.badgeAllowed).toBe(false);
  });

  it("identical file: the duplicate submission of IMG_1406 returns identical scores and is within noise", () => {
    const dup = data.duplicates.find((d) => d.id === "IMG_1406")!;
    expect(dup.scores).toEqual(p("IMG_1406").scores);
    const ev = evaluate({ before: p("IMG_1406").scores, after: dup.scores, conditions: match, noise, identical: true });
    expect(ev.identical).toBe(true);
    for (const m of ev.metrics) {
      expect(m.deltaRaw).toBe(0);
      expect(m.verdict).toBe("within-noise");
      expect(m.aboveNoise).toBe(false);
    }
  });

  it("identical flag wins even if scores somehow differ", () => {
    const ev = evaluate({ before: { moisture: { ui: 70, raw: 50 } }, after: { moisture: { ui: 80, raw: 70 } }, conditions: match, noise, identical: true });
    expect(ev.metrics[0].verdict).toBe("within-noise");
  });

  it("raw past MDC but display score unchanged is not claimable", () => {
    // Wrinkle in the positive control: ui 97 -> 97, raw +0.36 against a floor of 0.17.
    const before = { wrinkle: { ui: 97, raw: 98.73 } };
    const after = { wrinkle: { ui: 97, raw: 99.09 } };
    const ev = evaluate({ before, after, conditions: match, noise });
    expect(Math.abs(ev.metrics[0].deltaRaw)).toBeGreaterThan(noise.wrinkle.mdc95);
    expect(ev.metrics[0].deltaUi).toBe(0);
    expect(ev.metrics[0].verdict).toBe("no-visible-change");
    expect(ev.metrics[0].aboveNoise).toBe(true);
    expect(ev.badgeAllowed).toBe(false);
  });

  it("a one-point display change with raw past MDC is claimable", () => {
    const before = { wrinkle: { ui: 97, raw: 98.73 } };
    const after = { wrinkle: { ui: 98, raw: 99.09 } };
    expect(evaluate({ before, after, conditions: match, noise }).metrics[0].verdict).toBe("claimable");
  });

  it("positive control without a product category: moisture and radiance pass the numbers", () => {
    const sim = data.simulated!.find((x) => x.id === "IMG_1407_foundation1")!;
    const b = data.baselines!.find((x) => x.id === sim.baselineId)!;
    expect(b.sourceId).toBe(sim.sourceId);
    const conditions = compareConditions(b.capture, sim.capture);
    expect(conditions.match).toBe(true);
    const ev = evaluate({ before: b.scores, after: sim.scores, conditions, noise });
    const v = (m: Metric) => ev.metrics.find((x) => x.metric === m)!;
    expect(v("moisture").verdict).toBe("claimable");
    expect(v("radiance").verdict).toBe("claimable");
    expect(v("pore").verdict).toBe("within-noise");
    expect(v("wrinkle").verdict).toBe("no-visible-change");
  });

  it("positive control as foundation: radiance is an appearance claim, moisture and wrinkle are blocked by claim type", () => {
    const sim = data.simulated!.find((x) => x.id === "IMG_1407_foundation1")!;
    const b = data.baselines!.find((x) => x.id === sim.baselineId)!;
    const conditions = compareConditions(b.capture, sim.capture);
    const ev = evaluate({ before: b.scores, after: sim.scores, conditions, noise, product: "foundation" });
    const v = (m: Metric) => ev.metrics.find((x) => x.metric === m)!;
    expect(ev.product).toBe("foundation");
    expect(ev.badgeAllowed).toBe(true);
    expect(v("radiance").verdict).toBe("claimable");
    expect(v("radiance").claimKind).toBe("appearance");
    expect(v("moisture").verdict).toBe("blocked-claim-type");
    expect(v("moisture").reason).toBe("Foundation is makeup. A moisture claim needs a product such as a moisturizer or serum.");
    expect(v("moisture").aboveNoise).toBe(true);
    expect(v("wrinkle").verdict).toBe("blocked-claim-type");
    expect(v("pore").verdict).toBe("within-noise");
  });

  it("a moisturizer may claim moisture; sunscreen may claim nothing", () => {
    const before = { moisture: { ui: 75, raw: 65 } };
    const after = { moisture: { ui: 80, raw: 75 } };
    expect(evaluate({ before, after, conditions: match, noise, product: "moisturizer" }).metrics[0]).toMatchObject({ verdict: "claimable", claimKind: "skin" });
    expect(evaluate({ before, after, conditions: match, noise, product: "sunscreen" }).metrics[0].verdict).toBe("blocked-claim-type");
  });

  it("same file wins over claim type", () => {
    const s = { moisture: { ui: 75, raw: 65 } };
    expect(evaluate({ before: s, after: s, conditions: match, noise, identical: true, product: "foundation" }).metrics[0].verdict).toBe("within-noise");
  });

  it("resizing alone (2560 px vs 1920 px of IMG_1407) stays inside the noise floor", () => {
    const b = data.baselines!.find((x) => x.id === "IMG_1407_1920")!;
    const ev = evaluate({ before: p("IMG_1407").scores, after: b.scores, conditions: match, noise });
    for (const m of ev.metrics) expect(m.aboveNoise).toBe(false);
  });

  it("simulated photos stay out of the session data", () => {
    const ids = new Set(data.photos.map((x) => x.id));
    for (const s of [...(data.simulated ?? []), ...(data.baselines ?? [])]) expect(ids.has(s.id)).toBe(false);
  });
});
