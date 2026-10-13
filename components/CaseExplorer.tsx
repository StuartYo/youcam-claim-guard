"use client";

import { useState } from "react";
import { caseVerdict } from "@/lib/case-verdict";
import type { DemoCase } from "@/lib/demo";
import { ResultPanel } from "./ResultPanel";

export function CaseExplorer({ cases }: { cases: DemoCase[] }) {
  const [active, setActive] = useState(cases[0].slug);
  const current = cases.find((c) => c.slug === active)!;

  return (
    <div className="explorer">
      <div className="picker">
        <p className="demo-tag">Demo data: developer&apos;s own photos</p>
        <div className="picker__list" role="tablist" aria-label="Cases">
          {cases.map((c) => {
            const v = caseVerdict(c);
            return (
              <button
                key={c.slug}
                role="tab"
                aria-selected={c.slug === active}
                className={`pick ${c.slug === active ? "is-active" : ""}`}
                onClick={() => setActive(c.slug)}
              >
                <span className="pick__title">{c.title}</span>
                <span className={`pick__verdict pick__verdict--${v.tone}`}>{v.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="explorer__body" role="tabpanel">
        <p className="case-summary">{current.summary}</p>
        <ResultPanel before={current.before} after={current.after} conditions={current.conditions} evaluation={current.evaluation} />
      </div>
    </div>
  );
}
