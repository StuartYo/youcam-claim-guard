import { describe, expect, it } from "vitest";
import { CreditGuard, readLimits, sha256 } from "../lib/server/guard";

const result = { scores: { moisture: { ui: 75, raw: 65 } } };

describe("credit guard", () => {
  it("defaults to 20 per day and 4 per IP", () => {
    expect(readLimits({})).toEqual({ daily: 20, perIp: 4 });
    expect(readLimits({ DAILY_LIVE_LIMIT: "5", PER_IP_LIVE_LIMIT: "1" })).toEqual({ daily: 5, perIp: 1 });
    expect(readLimits({ DAILY_LIVE_LIMIT: "abc" })).toEqual({ daily: 20, perIp: 4 });
  });

  it("enforces the per-IP cap", () => {
    const g = new CreditGuard({ daily: 20, perIp: 4 });
    expect(g.check("a", 4).ok).toBe(true);
    for (let i = 0; i < 4; i++) g.record("a");
    const r = g.check("a", 1);
    expect(r.ok).toBe(false);
    expect(g.check("b", 2).ok).toBe(true);
  });

  it("enforces the global cap and points to demo mode", () => {
    const g = new CreditGuard({ daily: 3, perIp: 10 });
    g.record("a");
    g.record("b");
    const r = g.check("c", 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/demo/);
  });

  it("resets at the UTC day boundary", () => {
    let t = Date.parse("2026-10-13T23:59:00Z");
    const g = new CreditGuard({ daily: 1, perIp: 1 }, () => t);
    g.record("a");
    expect(g.check("a", 1).ok).toBe(false);
    t = Date.parse("2026-10-14T00:01:00Z");
    expect(g.check("a", 1).ok).toBe(true);
  });

  it("caches by SHA-256 and expires after 24h", () => {
    let t = 0;
    const g = new CreditGuard({ daily: 1, perIp: 1 }, () => t);
    const h = sha256(Buffer.from("photo"));
    expect(h).toHaveLength(64);
    g.setCached(h, result);
    expect(g.getCached(h)).toEqual(result);
    t = 25 * 3600 * 1000;
    expect(g.getCached(h)).toBeNull();
  });
});
