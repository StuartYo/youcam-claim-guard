import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import scores from "../data/scores.json";
import { MAX_IMAGE_BYTES, parseClaimCheckRequest, RequestError, toClaimCheckResponse } from "../lib/brand-api";
import { claimKind, CLAIM_POLICY, PRODUCT_CATEGORIES } from "../lib/claim-policy";
import { demoCases, getCase } from "../lib/demo";
import { caseVerdict } from "../lib/case-verdict";
import type { DemoData } from "../lib/demo-types";
import { measure } from "../lib/measure";
import { BodyTooLarge, RateLimiter, readBodyLimited } from "../lib/server/limits";

const data = scores as unknown as DemoData;
const demoFile = (id: string) => readFileSync(path.join(__dirname, "..", "public", "demo", `${id}.jpg`));
const jpeg = demoFile("IMG_1406").toString("base64");
const entries = { moisture: { ui: 75, raw: 65 } };

describe("claim policy", () => {
  it("covers every category and keeps foundation to appearance claims", () => {
    for (const c of PRODUCT_CATEGORIES) expect(CLAIM_POLICY[c]).toBeDefined();
    expect(claimKind("foundation", "moisture")).toBeNull();
    expect(claimKind("foundation", "radiance")).toBe("appearance");
    expect(claimKind("moisturizer", "moisture")).toBe("skin");
  });
});

describe("parseClaimCheckRequest", () => {
  const ok = { before: { scores: entries, image_base64: jpeg }, after: { scores: entries, image_base64: jpeg } };

  it("accepts a valid body with or without a product category", () => {
    expect(parseClaimCheckRequest(ok).product).toBeUndefined();
    expect(parseClaimCheckRequest({ ...ok, product_category: "foundation" }).product).toBe("foundation");
  });

  it("rejects bad input with a readable message", () => {
    const bad = (body: unknown, msg: RegExp) => {
      expect(() => parseClaimCheckRequest(body)).toThrow(RequestError);
      expect(() => parseClaimCheckRequest(body)).toThrow(msg);
    };
    bad(null, /JSON object/);
    bad([], /JSON object/);
    bad({ ...ok, product_category: "lipstick" }, /product_category must be one of/);
    bad({ ...ok, before: { ...ok.before, scores: { moisture: { ui: 140, raw: 65 } } } }, /between 0 and 100/);
    bad({ ...ok, before: { ...ok.before, scores: { moisture: { ui: Number.NaN, raw: 65 } } } }, /between 0 and 100/);
    bad({ ...ok, after: { ...ok.after, image_base64: "not base64!!" } }, /not valid base64/);
    bad({ ...ok, after: { ...ok.after, image_base64: Buffer.from("hello world, not an image").toString("base64") } }, /not a JPEG or PNG/);
    bad({ ...ok, after: { ...ok.after, image_base64: Buffer.alloc(MAX_IMAGE_BYTES + 10, 0xff).toString("base64") } }, /larger than 4 MB/);
  });
});

describe("rate limit and body cap", () => {
  it("allows max requests per window, then answers with a retry time", () => {
    let t = 0;
    const l = new RateLimiter(2, 60_000, () => t);
    expect(l.take("a").ok).toBe(true);
    expect(l.take("a").ok).toBe(true);
    const r = l.take("a");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAfter).toBe(60);
    expect(l.take("b").ok).toBe(true);
    t = 60_001;
    expect(l.take("a").ok).toBe(true);
  });

  it("refuses an oversized body by header and while streaming", async () => {
    const big = new Request("http://x/", { method: "POST", body: "x".repeat(100), headers: { "content-length": "100" } });
    await expect(readBodyLimited(big, 50)).rejects.toBeInstanceOf(BodyTooLarge);
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(40));
        c.enqueue(new Uint8Array(40));
        c.close();
      },
    });
    const lying = new Request("http://x/", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    await expect(readBodyLimited(lying, 50)).rejects.toBeInstanceOf(BodyTooLarge);
    const small = new Request("http://x/", { method: "POST", body: "abc" });
    expect((await readBodyLimited(small, 50)).toString()).toBe("abc");
  });
});

describe("sample trial uses the stored numbers", () => {
  it("measuring the uploaded demo file gives exactly the stored capture stats", async () => {
    for (const id of ["IMG_1373", "IMG_1406"]) {
      const p = data.photos.find((x) => x.id === id)!;
      expect(await measure(demoFile(id))).toEqual(p.capture);
    }
  });

  it("cached YouCam responses match the stored scores", () => {
    for (const id of ["IMG_1373", "IMG_1406"]) {
      const c = JSON.parse(readFileSync(path.join(__dirname, "..", "public", "demo", "youcam", `${id}.json`), "utf-8"));
      expect(c.cached.fetched).toBe("2026-10-13");
      expect(JSON.stringify(c)).not.toMatch(/X-Amz|AKIA|https?:\/\//);
      const m = c.response.data.results.output.find((o: { type: string }) => o.type === "moisture");
      expect(m.ui_score).toBe(data.photos.find((x) => x.id === id)!.scores.moisture!.ui);
    }
  });
});

describe("case labels", () => {
  it("the same file reads as within noise, not blocked", () => {
    expect(caseVerdict(getCase("same-file"))).toEqual({ label: "Within noise: same file", tone: "neutral" });
    expect(caseVerdict(getCase("room-desk")).tone).toBe("blocked");
    expect(caseVerdict(getCase("real-change")).label).toBe("Allowed: radiance");
  });

  it("the brand response marks the appearance claim", () => {
    const real = demoCases.find((c) => c.slug === "real-change")!;
    const r = toClaimCheckResponse(real.conditions, real.evaluation);
    expect(r.product_category).toBe("foundation");
    const radiance = r.metrics.find((m) => m.metric === "radiance")!;
    expect(radiance.badge).toBe("Radiance +11%");
    expect(radiance.badge_label).toBe("Appearance with product on");
    expect(r.metrics.find((m) => m.metric === "moisture")!.verdict).toBe("blocked-claim-type");
  });
});
