import { describe, expect, it } from "vitest";
import { auditCsv, auditEntry } from "../lib/audit";
import { demoCases, getCase } from "../lib/demo";
import { badgeText } from "../lib/noise";
import { liveEnabled } from "../lib/server/guard";

describe("audit log", () => {
  const rows = demoCases.map((c) => auditEntry(c.slug, "2026-10-13", "demo case", c.conditions, c.evaluation));

  it("has one row per demo case with every metric, the product and the thresholds", () => {
    expect(rows).toHaveLength(demoCases.length);
    const m = rows.find((r) => r.id === "moisturizer")!;
    expect(m.product).toBe("moisturizer");
    expect(m.metrics.map((x) => x.verdict)).toEqual(["within-noise", "blocked-claim-type", "blocked-claim-type", "claimable"]);
    expect(m.metrics.find((x) => x.metric === "radiance")!.badge).toBeNull();
    expect(m.thresholds).toMatch(/capture-v2: face brightness ±10%, backlight 15% max, light colour ±2%; raw noise floor moisture ±7\.10/);
  });

  it("exports CSV with one line per metric and quotes commas", () => {
    const csv = auditCsv(rows);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("time,id,source,product_category,badge_allowed,conditions,metric,verdict,badge,reason,thresholds");
    expect(lines).toHaveLength(1 + rows.reduce((a, r) => a + r.metrics.length, 0));
    expect(csv).toContain('"Raw score moved +11.5, more than the ±3.8 that same-light retakes produce. This is an appearance claim');
  });
});

describe("labels and switches", () => {
  it("badges name the improvement for wrinkle and pore", () => {
    expect(badgeText("wrinkle", 12)).toBe("Smoother skin (wrinkle score) +12%");
    expect(badgeText("pore", 5)).toBe("Less visible pores (pore score) +5%");
    expect(getCase("real-change").evaluation.metrics.find((m) => m.metric === "radiance")!.verdict).toBe("claimable");
  });

  it("LIVE_ANALYSIS_ENABLED defaults to on", () => {
    expect(liveEnabled({})).toBe(true);
    expect(liveEnabled({ LIVE_ANALYSIS_ENABLED: "true" })).toBe(true);
    expect(liveEnabled({ LIVE_ANALYSIS_ENABLED: "false" })).toBe(false);
    expect(liveEnabled({ LIVE_ANALYSIS_ENABLED: "0" })).toBe(false);
  });
});
