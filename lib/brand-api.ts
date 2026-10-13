import { APPEARANCE_LABEL, isProductCategory, PRODUCT_CATEGORIES, type ClaimKind, type ProductCategory } from "./claim-policy";
import type { ConditionsResult } from "./conditions";
import { badgeText, isGainBadge, METRICS, type Evaluation, type Metric, type Scores } from "./noise";

/** Shape of the brand-facing response. Kept separate so the docs example and the endpoint can't drift. */
export interface ClaimCheckResponse {
  badge_allowed: boolean;
  /** Echo of the request's product_category, or null when none was sent (then the claim-type check is skipped). */
  product_category: ProductCategory | null;
  conditions: { match: boolean; reasons: string[] };
  metrics: Array<{
    metric: Metric;
    verdict: Evaluation["metrics"][number]["verdict"];
    display_change_pct: number;
    raw_delta: number;
    mdc95: number;
    /** Badge text for a confirmed gain. Null otherwise, including a confirmed drop. */
    badge: string | null;
    /** "skin" or "appearance" when a product_category was sent; null when the category may not claim this metric. */
    claim_kind?: ClaimKind | null;
    /** Text to show next to an appearance badge. */
    badge_label?: string;
    reason: string;
  }>;
}

export function toClaimCheckResponse(conditions: ConditionsResult, ev: Evaluation): ClaimCheckResponse {
  return {
    badge_allowed: ev.badgeAllowed,
    product_category: ev.product ?? null,
    conditions: { match: conditions.match, reasons: conditions.reasons },
    metrics: ev.metrics.map((m) => ({
      metric: m.metric,
      verdict: m.verdict,
      display_change_pct: m.deltaUiPct,
      raw_delta: m.deltaRaw,
      mdc95: m.mdc95,
      badge: isGainBadge(m) ? badgeText(m.metric, m.deltaUiPct) : null,
      ...(m.claimKind !== undefined ? { claim_kind: m.claimKind } : {}),
      ...(isGainBadge(m) && m.claimKind === "appearance" ? { badge_label: APPEARANCE_LABEL } : {}),
      reason: m.reason,
    })),
  };
}

const validScore = (ui: unknown, raw: unknown): ui is number =>
  typeof ui === "number" && typeof raw === "number" && Number.isFinite(ui) && Number.isFinite(raw) && ui >= 0 && ui <= 100 && raw >= 0 && raw <= 100;

/** Accepts YouCam output entries ({type, ui_score, raw_score}) or a {metric: {ui, raw}} map. */
export function parseScoresInput(v: unknown): Scores | null {
  const out: Scores = {};
  if (Array.isArray(v)) {
    for (const o of v as Array<Record<string, unknown>>) {
      if ((METRICS as readonly string[]).includes(o?.type as string) && validScore(o.ui_score, o.raw_score)) {
        out[o.type as Metric] = { ui: o.ui_score as number, raw: o.raw_score as number };
      }
    }
  } else if (v && typeof v === "object") {
    for (const m of METRICS) {
      const s = (v as Record<string, { ui?: unknown; raw?: unknown }>)[m];
      if (s && validScore(s.ui, s.raw)) out[m] = { ui: s.ui as number, raw: s.raw as number };
    }
  }
  return Object.keys(out).length ? out : null;
}

export class RequestError extends Error {}

/** Largest photo accepted by /api/v1/claim-check, after base64 decoding. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** Two base64 photos plus scores fit well inside this. */
export const MAX_BODY_BYTES = 12 * 1024 * 1024;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function sniffImage(b: Buffer): boolean {
  const jpeg = b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png = b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return jpeg || png;
}

export function decodeImage(v: unknown, label: string): Buffer {
  if (typeof v !== "string" || !v) throw new RequestError(`${label}.image_base64 is required`);
  const s = v.replace(/^data:image\/(jpeg|png);base64,/, "").replace(/\s+/g, "");
  if (s.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4) throw new RequestError(`${label}.image_base64 is larger than 4 MB`);
  if (s.length % 4 !== 0 || !BASE64.test(s)) throw new RequestError(`${label}.image_base64 is not valid base64`);
  const b = Buffer.from(s, "base64");
  if (b.length === 0) throw new RequestError(`${label}.image_base64 is empty`);
  if (b.length > MAX_IMAGE_BYTES) throw new RequestError(`${label}.image_base64 is larger than 4 MB`);
  if (!sniffImage(b)) throw new RequestError(`${label}.image_base64 is not a JPEG or PNG`);
  return b;
}

export interface ClaimCheckRequest {
  before: Scores;
  after: Scores;
  product?: ProductCategory;
  beforeImage: Buffer;
  afterImage: Buffer;
}

/** Validates a parsed JSON body. Throws RequestError with a message safe to return to the caller. */
export function parseClaimCheckRequest(body: unknown): ClaimCheckRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new RequestError("Body must be a JSON object.");
  const b = body as Record<string, unknown>;
  const side = (k: "before" | "after") => {
    const v = b[k];
    if (!v || typeof v !== "object") throw new RequestError(`${k} is required`);
    return v as Record<string, unknown>;
  };
  const bs = side("before");
  const as = side("after");
  const before = parseScoresInput(bs.scores);
  const after = parseScoresInput(as.scores);
  if (!before || !after) throw new RequestError("before.scores and after.scores must contain moisture, pore, wrinkle or radiance with ui and raw values between 0 and 100");
  let product: ProductCategory | undefined;
  if (b.product_category !== undefined && b.product_category !== null) {
    if (!isProductCategory(b.product_category)) throw new RequestError(`product_category must be one of: ${PRODUCT_CATEGORIES.join(", ")}`);
    product = b.product_category;
  }
  return { before, after, product, beforeImage: decodeImage(bs.image_base64, "before"), afterImage: decodeImage(as.image_base64, "after") };
}
