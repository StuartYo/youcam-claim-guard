import type { DemoCase } from "./demo";
import { METRIC_LABEL } from "./metrics";

export type CaseTone = "ok" | "blocked" | "neutral";

/** One short label per case, taken from the per-metric verdicts, so a list of cases never says "blocked" for a within-noise result. */
export function caseVerdict(c: DemoCase): { label: string; tone: CaseTone } {
  const ms = c.evaluation.metrics;
  const allowed = ms.filter((m) => m.verdict === "claimable");
  const gains = allowed.filter((m) => m.deltaUi > 0);
  if (gains.length) return { label: `Allowed: ${gains.map((m) => METRIC_LABEL[m.metric].toLowerCase()).join(", ")}`, tone: "ok" };
  if (allowed.length) return { label: `No gain: ${allowed.map((m) => METRIC_LABEL[m.metric].toLowerCase()).join(", ")} fell`, tone: "neutral" };
  if (c.evaluation.identical) return { label: "Within noise: same file", tone: "neutral" };
  if (ms.some((m) => m.verdict === "blocked-conditions")) return { label: "Blocked: photos not comparable", tone: "blocked" };
  if (ms.length && ms.every((m) => m.verdict === "blocked-claim-type")) return { label: "Blocked: claim type", tone: "blocked" };
  return { label: "Within noise", tone: "neutral" };
}
