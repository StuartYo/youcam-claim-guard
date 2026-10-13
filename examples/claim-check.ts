// Copy-paste client for POST /api/v1/claim-check. Needs Node 18+ (fetch). No other dependencies.
type Scores = Array<{ type: string; ui_score: number; raw_score: number }> | Record<string, { ui: number; raw: number }>;
type Photo = Buffer | Blob;

export interface ClaimCheckResponse {
  badge_allowed: boolean;
  conditions: { match: boolean; reasons: string[] };
  metrics: Array<{ metric: string; verdict: string; display_change_pct: number; badge: string | null; reason: string }>;
}

const b64 = async (p: Photo) => (p instanceof Blob ? Buffer.from(await p.arrayBuffer()) : p).toString("base64");

export async function claimCheck(input: {
  baseUrl: string;
  before: { scores: Scores; photo: Photo };
  after: { scores: Scores; photo: Photo };
  productCategory?: string;
}): Promise<ClaimCheckResponse> {
  const res = await fetch(`${input.baseUrl}/api/v1/claim-check`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      before: { scores: input.before.scores, image_base64: await b64(input.before.photo) },
      after: { scores: input.after.scores, image_base64: await b64(input.after.photo) },
      product_category: input.productCategory,
    }),
  });
  if (!res.ok) throw new Error(`claim-check failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// Usage: show only the badges the check allows.
// const r = await claimCheck({ baseUrl, before: { scores: s1, photo: p1 }, after: { scores: s2, photo: p2 }, productCategory: "serum" });
// if (r.badge_allowed) for (const m of r.metrics) if (m.badge) show(m.badge);
