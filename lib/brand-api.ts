import type { ConditionsResult } from "./conditions";
import { badgeText, METRICS, type Evaluation, type Metric, type Scores } from "./noise";

/** Shape of the brand-facing response. Kept separate so the docs example and the endpoint can't drift. */
export interface ClaimCheckResponse {
  badge_allowed: boolean;
  conditions: { match: boolean; reasons: string[] };
  metrics: Array<{
    metric: Metric;
    verdict: Evaluation["metrics"][number]["verdict"];
    display_change_pct: number;
    raw_delta: number;
    mdc95: number;
    badge: string | null;
    reason: string;
  }>;
}

export function toClaimCheckResponse(conditions: ConditionsResult, ev: Evaluation): ClaimCheckResponse {
  return {
    badge_allowed: ev.badgeAllowed,
    conditions: { match: conditions.match, reasons: conditions.reasons },
    metrics: ev.metrics.map((m) => ({
      metric: m.metric,
      verdict: m.verdict,
      display_change_pct: m.deltaUiPct,
      raw_delta: m.deltaRaw,
      mdc95: m.mdc95,
      badge: m.verdict === "claimable" ? badgeText(m.metric, m.deltaUiPct) : null,
      reason: m.reason,
    })),
  };
}

/** Accepts YouCam output entries ({type, ui_score, raw_score}) or a {metric: {ui, raw}} map. */
export function parseScoresInput(v: unknown): Scores | null {
  const out: Scores = {};
  if (Array.isArray(v)) {
    for (const o of v as Array<Record<string, unknown>>) {
      if ((METRICS as readonly string[]).includes(o?.type as string) && typeof o.ui_score === "number" && typeof o.raw_score === "number") {
        out[o.type as Metric] = { ui: o.ui_score, raw: o.raw_score };
      }
    }
  } else if (v && typeof v === "object") {
    for (const m of METRICS) {
      const s = (v as Record<string, { ui?: unknown; raw?: unknown }>)[m];
      if (s && typeof s.ui === "number" && typeof s.raw === "number") out[m] = { ui: s.ui, raw: s.raw };
    }
  }
  return Object.keys(out).length ? out : null;
}
