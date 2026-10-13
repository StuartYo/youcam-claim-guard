"use client";

import { useState } from "react";
import type { DemoCase, PlaceholderCase } from "@/lib/demo";
import { ResultPanel } from "./ResultPanel";

export function CaseExplorer({ cases }: { cases: Array<DemoCase | PlaceholderCase> }) {
  const [active, setActive] = useState(cases[0].slug);
  const current = cases.find((c) => c.slug === active)!;

  return (
    <div className="explorer">
      <div className="picker">
        <p className="demo-tag">Demo data: developer&apos;s own photos</p>
        <div className="picker__list" role="tablist" aria-label="Cases">
          {cases.map((c) => {
            const ph = "placeholder" in c;
            const verdict = ph ? "Not created yet" : c.evaluation.badgeAllowed ? "Badge allowed" : "Badge blocked";
            return (
              <button
                key={c.slug}
                role="tab"
                aria-selected={c.slug === active}
                className={`pick ${c.slug === active ? "is-active" : ""} ${ph ? "pick--placeholder" : ""}`}
                onClick={() => setActive(c.slug)}
              >
                <span className="pick__title">{c.title}</span>
                <span className="pick__verdict">{verdict}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="explorer__body" role="tabpanel">
        <p className="case-summary">{current.summary}</p>
        {"placeholder" in current ? (
          <div className="placeholder">
            <p className="placeholder__title">Slot reserved</p>
            <p>
              The plan: take one photo, apply a visible change with YouCam makeup virtual try-on, keep the light the same, and run both through skin
              analysis. If Claim Guard is doing its job, this is the case where the badge goes through.
            </p>
          </div>
        ) : (
          <ResultPanel before={current.before} after={current.after} conditions={current.conditions} evaluation={current.evaluation} demo />
        )}
      </div>
    </div>
  );
}
