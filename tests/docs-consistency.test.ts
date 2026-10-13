import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import scores from "../data/scores.json";
import type { DemoData } from "../lib/demo-types";
import { calibrationMarkdown, calibrationTable } from "../lib/calibration";
import { fix, headline, pairSentence } from "../lib/summary";

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

  it("pair counts: every in-sample pair is counted once", () => {
    expect(h.pairs.total).toBe(210);
    expect(h.pairs.sameSetup).toEqual({ total: 42, passed: 42, desk: 30, ceiling: 12 });
    expect(h.pairs.changed).toEqual({ total: 168, blocked: 168, acrossSetups: 148, bothBacklit: 20 });
    expect(h.pairs.sameSetup.total + h.pairs.changed.total).toBe(h.pairs.total);
    expect(readme).toContain(pairSentence(h.pairs));
  });

  it("the README calibration table is the one the page renders", () => {
    expect(readme).toContain(calibrationMarkdown(calibrationTable(data.photos)));
  });

  it("no lamp-only wording for photos that changed room", () => {
    for (const doc of [readme, noiseDoc, read("docs/positive-control-2026-10-13.md"), read("app/page.tsx"), read("lib/demo.ts"), read("scripts/cover.mjs")]) {
      expect(doc).not.toMatch(/Only the lamp changed: ceiling|Changing only the lamp|Light alone moves|Different lamp|Lamp changed, nothing else/);
      expect(doc).not.toMatch(/only the face changed/i);
      expect(doc).not.toMatch(/held back/i);
    }
  });

  it("the page uses three demo-data labels, one per place", () => {
    const n = (f: string) => (read(f).match(/Demo data:/g) ?? []).length;
    expect(n("app/page.tsx") + n("components/CaseExplorer.tsx") + n("components/ResultPanel.tsx") + n("components/LiveMode.tsx")).toBe(3);
  });

  it("no stale numbers remain", () => {
    for (const doc of [readme, noiseDoc, read("docs/positive-control-2026-10-13.md")]) {
      expect(doc).not.toContain("73.2");
    }
  });
});
