import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// No real key and no real YouCam call in tests: the key loader returns null unless a test sets it,
// and analyzeSkin fails loudly if anything reaches it.
let fakeKey: string | null = null;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/key", () => ({ getApiKey: () => fakeKey }));
vi.mock("@/lib/server/youcam", () => ({
  YouCamError: class extends Error {},
  analyzeSkin: () => {
    throw new Error("analyzeSkin must not be called in tests");
  },
}));

const { POST: analyze } = await import("../app/api/analyze/route");
const { POST: conditions } = await import("../app/api/conditions/route");

const jpg = readFileSync(path.join(__dirname, "..", "public", "demo", "IMG_1406.jpg"));
let ip = 0;
const req = (body?: BodyInit, headers: Record<string, string> = {}) =>
  new Request("http://x/api/analyze", { method: "POST", body, headers: { "x-forwarded-for": `10.0.0.${++ip}`, ...headers } });
const form = (fields: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.append("before", new Blob([jpg], { type: "image/jpeg" }), "before.jpg");
  fd.append("after", new Blob([jpg], { type: "image/jpeg" }), "after.jpg");
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
};
const errorOf = async (r: Response) => ((await r.json()) as { error: string }).error;

afterEach(() => {
  fakeKey = null;
  delete process.env.LIVE_ANALYSIS_ENABLED;
});

describe("/api/analyze input handling (no YouCam call)", () => {
  it("empty body: 400 with a reason, not 500", async () => {
    const r = await analyze(req());
    expect(r.status).toBe(400);
    expect(await errorOf(r)).toMatch(/multipart\/form-data/);
  });

  it("invalid JSON-looking body: 400", async () => {
    const r = await analyze(req("{not json", { "content-type": "application/json" }));
    expect(r.status).toBe(400);
  });

  it("broken multipart body: 400", async () => {
    const r = await analyze(req("garbage", { "content-type": "multipart/form-data; boundary=xyz" }));
    expect(r.status).toBe(400);
  });

  it("missing photo: 400", async () => {
    const fd = new FormData();
    fd.append("consent", "1");
    const r = await analyze(req(fd));
    expect(r.status).toBe(400);
    expect(await errorOf(r)).toMatch(/Both photos/);
  });

  it("consent is enforced on the server", async () => {
    fakeKey = "test-key-not-real";
    const r = await analyze(req(form()));
    expect(r.status).toBe(400);
    expect(await errorOf(r)).toMatch(/Consent is required/);
  });

  it("unknown product_category: 400", async () => {
    const r = await analyze(req(form({ consent: "1", product_category: "lipstick" })));
    expect(r.status).toBe(400);
    expect(await errorOf(r)).toMatch(/product_category must be one of/);
  });

  it("LIVE_ANALYSIS_ENABLED=false switches paid analysis off", async () => {
    fakeKey = "test-key-not-real";
    process.env.LIVE_ANALYSIS_ENABLED = "false";
    const r = await analyze(req(form({ consent: "1", product_category: "moisturizer" })));
    expect(r.status).toBe(503);
    expect(await errorOf(r)).toMatch(/switched off/);
  });

  it("no key configured: 503, after validation passed", async () => {
    const r = await analyze(req(form({ consent: "1" })));
    expect(r.status).toBe(503);
    expect(await errorOf(r)).toMatch(/not configured/);
  });
});

describe("/api/conditions input handling", () => {
  it("empty body: 400 with a reason", async () => {
    const r = await conditions(req());
    expect(r.status).toBe(400);
    expect(await errorOf(r)).toMatch(/before and after/);
  });

  it("two photos: 200 with three checks", async () => {
    const r = await conditions(req(form()));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.conditions.checks).toHaveLength(3);
    expect(j.live.configured).toBe(false);
  });
});
