import { describe, expect, it } from "vitest";
import scores from "../data/scores.json";
import { caseVerdict, demoCases, getCase, HEADLINE_SLUG, heldOutRep } from "../lib/demo";
import type { DemoData } from "../lib/demo-types";
import { heldOutTally } from "../lib/heldout";
import type { Metric } from "../lib/noise";
import { pairTally } from "../lib/summary";

const data = scores as unknown as DemoData;
const held = data.heldOut ?? [];
const tally = heldOutTally(held.map((p) => ({ id: p.id, setup: p.setup!, capture: p.capture })));

describe("held-out check (session4, limits frozen from sessions 1 to 3)", () => {
  it("has four photos in each of A, B and C, kept out of the in-sample photos", () => {
    expect(["A", "B", "C"].map((s) => held.filter((p) => p.setup === s).length)).toEqual([4, 4, 4]);
    const ids = new Set(data.photos.map((p) => p.id));
    for (const p of held) expect(ids.has(p.id)).toBe(false);
    expect(pairTally(data.photos).total).toBe(210);
  });

  it("reports the actual rates", () => {
    expect(tally.sameSetup).toMatchObject({ total: 36, passed: 32, failing: { "Face brightness": 4 } });
    expect(tally.byPair["B-B"].passed).toBe(8);
    expect(tally.differentLight).toMatchObject({ total: 64, passed: 0 });
    expect(tally.sameLightSkinChange).toMatchObject({ total: 32, passed: 10, failing: { "Light colour": 15, "Face brightness": 7 } });
  });
});

describe("held-out demo cases", () => {
  const v = (slug: string, m: Metric) => getCase(slug).evaluation.metrics.find((x) => x.metric === m)!;

  it("representatives are the shots closest to their group mean, and the headline hook uses them", () => {
    expect(heldOutRep("A").id).toBe("IMG_1437");
    expect(heldOutRep("B").id).toBe("IMG_1432");
    expect(heldOutRep("C").id).toBe("IMG_1442");
    expect(data.lampOnly).toMatchObject({ beforeId: heldOutRep("A").id, afterId: heldOutRep("B").id });
  });

  it("same room, ceiling light to desk lamp: the hero, blocked by the capture check although moisture and wrinkle pass the noise floor", () => {
    expect(HEADLINE_SLUG).toBe("same-room-lamp");
    expect(demoCases[0].slug).toBe("same-room-lamp");
    const c = getCase("same-room-lamp");
    expect(c.title).not.toMatch(/only/i);
    expect(c.summary).toMatch(/phone was re-positioned/);
    expect(c.conditions.match).toBe(false);
    expect(v("same-room-lamp", "moisture")).toMatchObject({ verdict: "blocked-conditions", aboveNoise: true, deltaUi: 5 });
    expect(v("same-room-lamp", "wrinkle")).toMatchObject({ verdict: "blocked-conditions", aboveNoise: true, deltaUi: 10 });
    expect(c.evaluation.badgeAllowed).toBe(false);
  });

  it("real moisturizer, same lamp: no moisture badge; moisture is inside the floor, pore and wrinkle blocked by claim type", () => {
    const c = getCase("moisturizer");
    expect(c.product).toBe("moisturizer");
    expect(c.evaluation.badgeAllowed).toBe(false);
    expect(v("moisturizer", "moisture").aboveNoise).toBe(false);
    expect(v("moisturizer", "moisture").verdict).toBe("blocked-conditions");
    expect(v("moisturizer", "pore").verdict).toBe("blocked-claim-type");
    expect(v("moisturizer", "wrinkle").verdict).toBe("blocked-claim-type");
    expect(v("moisturizer", "radiance").verdict).toBe("blocked-conditions");
    expect(c.conditions.reasons).toHaveLength(1);
    expect(c.conditions.reasons[0]).toMatch(/10\.1% brighter/);
    expect(caseVerdict(c).tone).toBe("blocked");
  });
});
