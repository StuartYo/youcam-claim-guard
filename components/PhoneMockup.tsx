"use client";

import { useState } from "react";

export interface PhoneScreen {
  key: string;
  tab: string;
  beforeImage: string;
  afterImage: string;
  rows: Array<{ label: string; hint?: string; before: number; after: number; badge: string | null; note?: string }>;
  allowed: boolean;
  /** Body text of the bottom card. */
  why: string;
}

/**
 * A code-drawn phone showing what a brand's app would display after calling Claim Guard.
 * The brand name is made up; photos and scores come from the demo cases.
 */
export function PhoneMockup({ screens }: { screens: PhoneScreen[] }) {
  const [active, setActive] = useState(screens[0].key);
  const s = screens.find((x) => x.key === active)!;

  return (
    <div className="phone-wrap">
      <div className="seg" role="tablist" aria-label="Phone example">
        {screens.map((x) => (
          <button key={x.key} role="tab" aria-selected={x.key === active} className={x.key === active ? "is-active" : ""} onClick={() => setActive(x.key)}>
            {x.tab}
          </button>
        ))}
      </div>
      <div className="phone" role="img" aria-label={`Brand app screen: ${s.allowed ? "progress badge shown" : "progress badge blocked"}`}>
        <div className="phone__notch" />
        <div className="phone__screen">
          <div className="phone__status">
            <span>9:41</span>
            <span className="phone__icons" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </div>
          <div className="app__head">
            <span className="app__brand">Aster Skin</span>
            <span className="app__title">Your skin report</span>
          </div>
          <div className="app__photos">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.beforeImage} alt="" width={540} height={720} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.afterImage} alt="" width={540} height={720} />
            <span className="app__ph app__ph--l">Last scan</span>
            <span className="app__ph app__ph--r">Today</span>
          </div>
          <ul className="app__rows">
            {s.rows.map((r) => (
              <li key={r.label}>
                <span>
                  {r.label}
                  {r.hint && <small className="app__hint">{r.hint}</small>}
                </span>
                <span className="app__score">
                  {r.before} <span aria-hidden="true">&rarr;</span> {r.after}
                </span>
                {s.allowed && r.badge && <span className="app__badge">{r.badge}</span>}
                {r.note && <span className="app__note">{r.note}</span>}
              </li>
            ))}
          </ul>
          {s.allowed ? (
            <div className="app__card app__card--ok">
              <p className="app__card-title">Your progress</p>
              <p>{s.why}</p>
              <span className="app__btn">See details</span>
            </div>
          ) : (
            <div className="app__card">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="app__icon">
                <path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z" />
              </svg>
              <p className="app__card-title">Retake in the same light to see your progress</p>
              <p>{s.why}</p>
              <span className="app__btn">Retake photo</span>
            </div>
          )}
        </div>
      </div>
      <p className="phone-note">Made-up brand app. Photos and scores are from the demo cases above.</p>
    </div>
  );
}
