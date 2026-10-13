/**
 * Claim-product consistency. A configurable policy, not a regulation.
 *
 * A before/after score is a claim about a product, so the product has to be the kind of thing that can cause that change.
 * Foundation can make skin look more radiant while it is on; it does not add moisture. This table says which metrics a
 * product category may make claims about, and whether that claim is about the skin itself or about how it looks with
 * the product on. A brand's compliance team would edit this table; the defaults below are a starting point.
 */
import { METRIC_LABEL, METRICS, type Metric } from "./metrics";

export const PRODUCT_CATEGORIES = ["moisturizer", "serum", "foundation", "cleanser", "sunscreen"] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

/** "skin": a claim about the skin after use. "appearance": a claim about how the skin looks while the product is on. */
export type ClaimKind = "skin" | "appearance";

export interface CategoryPolicy {
  label: string;
  /** True for makeup: anything it changes is on top of the skin. */
  makeup: boolean;
  allowed: Partial<Record<Metric, ClaimKind>>;
}

export const CLAIM_POLICY: Record<ProductCategory, CategoryPolicy> = {
  moisturizer: { label: "Moisturizer", makeup: false, allowed: { moisture: "skin", radiance: "skin" } },
  serum: { label: "Serum", makeup: false, allowed: { moisture: "skin", pore: "skin", wrinkle: "skin", radiance: "skin" } },
  foundation: { label: "Foundation", makeup: true, allowed: { radiance: "appearance", pore: "appearance" } },
  cleanser: { label: "Cleanser", makeup: false, allowed: { pore: "skin" } },
  sunscreen: { label: "Sunscreen", makeup: false, allowed: {} },
};

export const APPEARANCE_LABEL = "Appearance with product on";

export function isProductCategory(v: unknown): v is ProductCategory {
  return typeof v === "string" && (PRODUCT_CATEGORIES as readonly string[]).includes(v);
}

/** Which kind of claim this category may make about this metric, or null when it may not make one. */
export function claimKind(category: ProductCategory, metric: Metric): ClaimKind | null {
  return CLAIM_POLICY[category].allowed[metric] ?? null;
}

/** Plain reason for a metric the category may not claim. */
export function claimTypeReason(category: ProductCategory, metric: Metric): string {
  const p = CLAIM_POLICY[category];
  const needs = (Object.keys(CLAIM_POLICY) as ProductCategory[])
    .filter((c) => CLAIM_POLICY[c].allowed[metric] === "skin")
    .map((c) => CLAIM_POLICY[c].label.toLowerCase());
  const what = METRIC_LABEL[metric].toLowerCase();
  const first = p.makeup ? `${p.label} is makeup.` : `${p.label} is not a product that changes ${what}.`;
  const second = needs.length ? `A ${what} claim needs a product such as a ${needs.join(" or ")}.` : `No category in this policy may claim ${what}.`;
  return `${first} ${second}`;
}

/** The policy as rows, for the docs table and the page. */
export function policyRows() {
  return PRODUCT_CATEGORIES.map((c) => ({
    category: c,
    label: CLAIM_POLICY[c].label,
    metrics: METRICS.map((m) => ({ metric: m, kind: claimKind(c, m) })),
  }));
}
