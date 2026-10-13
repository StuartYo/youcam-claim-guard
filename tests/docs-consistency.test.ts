import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import scores from "../data/scores.json";
import type { DemoData } from "../lib/demo-types";
import { fix, headline } from "../lib/summary";

const data = scores as unknown as DemoData;
const read = (f: string) => readFileSync(path.join(__dirname, "..", f), "utf-8");
const h = headline(data);

describe("one rounding rule", () => {
  it("rounds half up", () => {
    expect(fix(73.25)).toBe("73.3");
    expect(fix(84.25)).toBe("84.3");
    expect(fix(9.14)).toBe("9.1");
  });
});

describe("README and docs quote the numbers the page computes", () => {
  const readme = read("README.md");
  const noiseDoc = read("docs/noise-floor-2026-10-13.md");

  it("lamp change on moisture", () => {
    expect(h.ceilingMoistureUi).toBe("73.3");
    expect(h.windowMoistureUi).toBe("80.0");
    const line = `ui ${h.ceilingMoistureUi} to ${h.windowMoistureUi} (+${h.lampMoisturePct}%), raw ${h.ceilingMoistureRaw} to ${h.windowMoistureRaw}`;
    expect(readme).toContain(line);
    expect(noiseDoc).toContain(`ui ${h.ceilingMoistureUi} (ceiling) to ${h.windowMoistureUi} (window): +${h.lampMoisturePct}%`);
  });

  it("pair counts", () => {
    expect(h.pairs.sameLight).toEqual({ total: 30, passed: 30 });
    expect(h.pairs.changed).toEqual({ total: 168, blocked: 168 });
    expect(readme).toContain(`all ${h.pairs.sameLight.total} same-light pairs and block all ${h.pairs.changed.total} pairs`);
    expect(readme).toContain(`${h.pairs.ceilingOnly.total} ceiling-only pairs`);
  });

  it("no stale numbers remain", () => {
    for (const doc of [readme, noiseDoc, read("docs/positive-control-2026-10-13.md")]) {
      expect(doc).not.toMatch(/\b148\b/);
      expect(doc).not.toContain("73.2");
    }
  });
});
