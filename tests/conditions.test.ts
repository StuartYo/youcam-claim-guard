import path from "node:path";
import { describe, expect, it } from "vitest";
import scores from "../data/scores.json";
import { compareConditions, THRESHOLDS, type CaptureStats } from "../lib/conditions";
import type { DemoData, DemoPhoto } from "../lib/demo-types";
import { measure } from "../lib/measure";

const data = scores as unknown as DemoData;
const bySession = (s: string) => data.photos.filter((p) => p.session === s);
const pairs = (xs: DemoPhoto[], ys: DemoPhoto[]) => xs.flatMap((a) => ys.filter((b) => b !== a).map((b) => [a, b] as const));
const base: CaptureStats = { centerLum: 105, borderLum: 212, backlightRatio: 0.5, clippedBorder: 0, redBlue: 1.6 };

describe("compareConditions (synthetic)", () => {
  it("passes identical stats", () => {
    expect(compareConditions(base, base).match).toBe(true);
  });
  it("fails on a brightness jump with a readable reason", () => {
    const r = compareConditions(base, { ...base, centerLum: 125 });
    expect(r.match).toBe(false);
    expect(r.reasons[0]).toMatch(/brighter/);
  });
  it("flags a backlit photo", () => {
    const r = compareConditions(base, { ...base, clippedBorder: 0.5 });
    expect(r.checks.find((c) => c.id === "backlit")!.pass).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/after photo is backlit/);
  });
  it("flags a colour temperature shift", () => {
    const r = compareConditions(base, { ...base, redBlue: base.redBlue * (1 + THRESHOLDS.redBlueRelative + 0.01) });
    expect(r.reasons.join(" ")).toMatch(/warmer/);
  });
});

describe("calibration on the developer's photos", () => {
  it("every pair inside session1 (same light) passes", () => {
    for (const [a, b] of pairs(bySession("s1"), bySession("s1"))) expect(compareConditions(a.capture, b.capture).match).toBe(true);
  });
  it("session1 vs session3 (ceiling light) fails in both directions", () => {
    for (const [a, b] of [...pairs(bySession("s1"), bySession("s3")), ...pairs(bySession("s3"), bySession("s1"))]) {
      expect(compareConditions(a.capture, b.capture).match).toBe(false);
    }
  });
  it("anything involving session2 (backlit window) fails and names the backlight", () => {
    for (const [a, b] of [...pairs(data.photos, bySession("s2")), ...pairs(bySession("s2"), data.photos)]) {
      const r = compareConditions(a.capture, b.capture);
      expect(r.match).toBe(false);
      expect(r.reasons.join(" ")).toMatch(/backlit/);
    }
  });
});

describe("measure (sharp)", () => {
  it("reproduces the stored stats from the committed demo image", async () => {
    const p = data.photos.find((x) => x.id === "IMG_1399")!;
    const s = await measure(path.join(__dirname, "..", "public", p.image));
    expect(s).toEqual(p.capture);
  });
  it("is deterministic for the same bytes", async () => {
    const f = path.join(__dirname, "..", "public", "demo", "IMG_1406.jpg");
    expect(await measure(f)).toEqual(await measure(f));
  });
});
