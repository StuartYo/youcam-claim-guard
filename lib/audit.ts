/**
 * Audit log rows for compliance teams: one row per claim check, with every metric's verdict and reason and the
 * limits that were in force. The demo keeps rows in the browser session (components/AuditLog.tsx); a brand would
 * write the same rows to its own store.
 */
import type { ProductCategory } from "./claim-policy";
import { CAPTURE_VERSION, THRESHOLDS, type ConditionsResult } from "./conditions";
import { badgeText, isGainBadge, METRIC_LABEL, type Evaluation } from "./noise";

export interface AuditMetric {
  metric: string;
  verdict: string;
  badge: string | null;
  reason: string;
}

export interface AuditEntry {
  /** ISO time of the check. Demo cases carry the date their photos were analyzed. */
  time: string;
  /** Case slug or request id. */
  id: string;
  source: "demo case" | "live upload" | "sample photos";
  product: ProductCategory | null;
  badgeAllowed: boolean;
  conditions: string;
  metrics: AuditMetric[];
  /** The limits used, in one line. */
  thresholds: string;
}

/** One line naming every limit that decided the verdicts. */
export function thresholdsLine(noise: Evaluation["metrics"]): string {
  const floor = noise.map((m) => `${METRIC_LABEL[m.metric].toLowerCase()} ±${m.mdc95.toFixed(2)}`).join(", ");
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  return `${CAPTURE_VERSION}: face brightness ±${pct(THRESHOLDS.faceLumRelative)}, backlight ${pct(THRESHOLDS.clippedBorder)} max, light colour ±${pct(THRESHOLDS.redBlueRelative)}; raw noise floor ${floor}; display change 1 point`;
}

export function auditEntry(
  id: string,
  time: string,
  source: AuditEntry["source"],
  conditions: ConditionsResult,
  ev: Evaluation,
): AuditEntry {
  return {
    time,
    id,
    source,
    product: ev.product ?? null,
    badgeAllowed: ev.badgeAllowed,
    conditions: conditions.match ? "match" : `differ: ${conditions.reasons.join(" ")}`,
    metrics: ev.metrics.map((m) => ({
      metric: m.metric,
      verdict: m.verdict,
      badge: isGainBadge(m) ? badgeText(m.metric, m.deltaUiPct) : null,
      reason: m.reason,
    })),
    thresholds: thresholdsLine(ev.metrics),
  };
}

const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV with one row per metric, so a spreadsheet can filter by verdict. */
export function auditCsv(entries: AuditEntry[]): string {
  const head = ["time", "id", "source", "product_category", "badge_allowed", "conditions", "metric", "verdict", "badge", "reason", "thresholds"];
  const rows = entries.flatMap((e) =>
    e.metrics.map((m) => [e.time, e.id, e.source, e.product ?? "", String(e.badgeAllowed), e.conditions, m.metric, m.verdict, m.badge ?? "", m.reason, e.thresholds]),
  );
  return [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** Browser event the live upload fires so the audit log table can add a row. */
export const AUDIT_EVENT = "claimguard:audit";
