"use client";

import { useEffect, useState } from "react";
import { AUDIT_EVENT, auditCsv, type AuditEntry } from "@/lib/audit";
import { CLAIM_POLICY } from "@/lib/claim-policy";
import { METRIC_LABEL, type Metric } from "@/lib/metrics";

const VERDICT_SHORT: Record<string, string> = {
  claimable: "Claimable",
  "within-noise": "Within noise",
  "no-visible-change": "No visible change",
  "blocked-conditions": "Blocked: conditions",
  "blocked-claim-type": "Blocked: claim type",
};

/**
 * Every claim check in this browser session, newest first. Demo cases are pre-filled; the sample photos and live
 * uploads add rows through a browser event. Nothing is sent anywhere: the rows live in this page until it is closed.
 */
export function AuditLog({ initial }: { initial: AuditEntry[] }) {
  const [rows, setRows] = useState<AuditEntry[]>(initial);

  useEffect(() => {
    const onAdd = (e: Event) => setRows((r) => [(e as CustomEvent<AuditEntry>).detail, ...r]);
    window.addEventListener(AUDIT_EVENT, onAdd);
    return () => window.removeEventListener(AUDIT_EVENT, onAdd);
  }, []);

  function download() {
    const blob = new Blob([auditCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "claim-guard-audit.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="audit">
      <div className="audit__bar">
        <p>
          {rows.length} checks in this session. Thresholds: <code>{rows[0]?.thresholds ?? ""}</code>
        </p>
        <button type="button" className="btn" onClick={download}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14" />
          </svg>
          Export CSV
        </button>
      </div>
      <div className="table-scroll audit__scroll">
        <table className="audit__table stack-sm">
          <thead>
            <tr>
              <th>Time (UTC)</th>
              <th>Case or request</th>
              <th>Product</th>
              <th>Conditions</th>
              <th>Per metric verdict and reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.id}-${r.time}-${i}`}>
                <td className="num nowrap" data-label="Time (UTC)">{r.time.replace("T", " ").slice(0, 16)}</td>
                <td data-label="Case or request">
                  <code>{r.id}</code>
                  <span className="td-sub">{r.source}</span>
                </td>
                <td data-label="Product">{r.product ? CLAIM_POLICY[r.product].label : "Not given"}</td>
                <td data-label="Conditions">{r.conditions === "match" ? (
                    "Match"
                  ) : (
                    <>
                      Differ<span className="td-sub">{r.conditions.replace(/^differ: /, "")}</span>
                    </>
                  )}</td>
                <td data-label="Verdicts" className="audit__verdicts">
                  <ul className="audit__metrics">
                    {r.metrics.map((m) => (
                      <li key={m.metric}>
                        <strong>{METRIC_LABEL[m.metric as Metric] ?? m.metric}:</strong>{" "}
                        <span className={`tag tag--${m.verdict}`}>{VERDICT_SHORT[m.verdict] ?? m.verdict}</span>
                        {m.badge && <span className="audit__badge">{m.badge}</span>} {m.reason}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
