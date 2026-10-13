"use client";

import { useState } from "react";
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
          {cases.map((c) => (
            <button
              key={c.slug}
              role="tab"
              aria-selected={c.slug === active}
              className={`pick ${c.slug === active ? "is-active" : ""}`}
              onClick={() => setActive(c.slug)}
            >
              <span className="pick__title">{c.title}</span>
              <span className="pick__verdict">{c.evaluation.badgeAllowed ? "Badge allowed" : "Badge blocked"}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="explorer__body" role="tabpanel">
        <p className="case-summary">{current.summary}</p>
        <ResultPanel before={current.before} after={current.after} conditions={current.conditions} evaluation={current.evaluation} demo />
      </div>
    </div>
  );
}
