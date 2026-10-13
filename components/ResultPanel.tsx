import type { ConditionsResult } from "@/lib/conditions";
import { badgeText, fmtSigned, METRIC_LABEL, type Evaluation, type Verdict } from "@/lib/noise";
import { NoiseRuler } from "./NoiseRuler";

export interface PanelSide {
  image: string;
  caption: string;
}

const VERDICT_LABEL: Record<Verdict, string> = {
  claimable: "Claimable",
  "within-noise": "Within noise",
  "no-visible-change": "No visible change",
  "blocked-conditions": "Conditions differ",
};

export function Mark({ ok }: { ok: boolean }) {
  return (
    <svg className={`mark ${ok ? "mark--ok" : "mark--no"}`} viewBox="0 0 16 16" aria-hidden="true">
      {ok ? <path d="M3.5 8.5l3 3 6-7" /> : <path d="M4 4l8 8M12 4l-8 8" />}
    </svg>
  );
}

function fmtCheckValue(id: string, v: number) {
  if (id === "backlit") return `${(v * 100).toFixed(1)}%`;
  if (id === "face-brightness") return v.toFixed(0);
  if (id === "color-temperature") return v.toFixed(3);
  return v.toFixed(2);
}

export function ConditionsList({ conditions }: { conditions: ConditionsResult }) {
  return (
    <ul className="checks">
      {conditions.checks.map((c) => (
        <li key={c.id} className={c.pass ? "check check--ok" : "check check--no"}>
          <Mark ok={c.pass} />
          <span className="check__label">{c.label}</span>
          <span className="check__values">
            {c.id === "backlit" ? (
              <>
                {fmtCheckValue(c.id, c.before)} / {fmtCheckValue(c.id, c.after)} blown out
              </>
            ) : (
              <>
                {fmtCheckValue(c.id, c.before)} &rarr; {fmtCheckValue(c.id, c.after)}
              </>
            )}
          </span>
          {!c.pass && <span className="check__reason">{c.reason}</span>}
        </li>
      ))}
    </ul>
  );
}

export function ResultPanel({
  before,
  after,
  conditions,
  evaluation,
  demo,
}: {
  before: PanelSide;
  after: PanelSide;
  conditions: ConditionsResult;
  evaluation: Evaluation;
  demo: boolean;
}) {
  const shown = evaluation.metrics.filter((m) => Math.round(m.deltaUiPct) !== 0);
  const allowed = evaluation.metrics.filter((m) => m.verdict === "claimable");
  const held = shown.filter((m) => m.verdict !== "claimable");
  const blockedBy = evaluation.identical ? "same-file" : !conditions.match ? "conditions" : "noise";

  return (
    <div className="panel">
      {demo && <p className="demo-tag">Demo data: developer&apos;s own photos</p>}
      <div className="photos">
        {[
          ["Before", before],
          ["After", after],
        ].map(([label, s]) => {
          const side = s as PanelSide;
          return (
            <figure key={label as string} className="photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={side.image} alt={`${label} photo: ${side.caption}`} width={540} height={720} loading="lazy" />
              <figcaption>
                <strong>{label as string}</strong> {side.caption}
              </figcaption>
            </figure>
          );
        })}
      </div>

      <div className="decision">
        <div className="decision__app">
          <p className="eyebrow">The app would show</p>
          <div className="badges">
            {shown.length === 0 && <span className="badge badge--none">No change</span>}
            {shown.map((m) => (
              <span key={m.metric} className="badge">
                {badgeText(m.metric, m.deltaUiPct)}
              </span>
            ))}
          </div>
        </div>
        <div className={`decision__verdict ${allowed.length ? "is-ok" : "is-blocked"}`}>
          <p className="eyebrow">Claim Guard</p>
          {allowed.length ? (
            <>
              <p className="verdict-line">
                Badge allowed for {allowed.map((m) => METRIC_LABEL[m.metric].toLowerCase()).join(" and ")}
              </p>
              <div className="badges badges--verdict">
                {allowed.map((m) => (
                  <span key={m.metric} className="badge badge--ok">
                    {badgeText(m.metric, m.deltaUiPct)}
                  </span>
                ))}
                {held.map((m) => (
                  <span key={m.metric} className="badge badge--held" title={m.reason}>
                    {badgeText(m.metric, m.deltaUiPct)} held back
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="verdict-line">
              Badge blocked
              <span>
                {blockedBy === "same-file"
                  ? "The two photos are the same file."
                  : blockedBy === "conditions"
                    ? "The photos were taken under different light."
                    : "Every change is inside the noise floor."}
              </span>
            </p>
          )}
        </div>
      </div>

      <section className="sub">
        <h4>Capture conditions</h4>
        <ConditionsList conditions={conditions} />
      </section>

      <section className="sub">
        <h4>Per metric</h4>
        <div className="metrics">
          {evaluation.metrics.map((m) => (
            <div key={m.metric} className={`metric metric--${m.verdict}`}>
              <div className="metric__head">
                <span className="metric__name">{METRIC_LABEL[m.metric]}</span>
                <span className="metric__ui">
                  score {m.before.ui} &rarr; {m.after.ui}
                  <em>{fmtSigned(m.deltaUiPct, 1)}%</em>
                </span>
                <span className={`tag tag--${m.verdict}`}>{VERDICT_LABEL[m.verdict]}</span>
              </div>
              <NoiseRuler deltaRaw={m.deltaRaw} mdc={m.mdc95} />
              <p className="metric__reason">
                {m.reason}
                {m.verdict === "blocked-conditions" && (
                  <>
                    {" "}
                    {m.aboveNoise
                      ? `A noise check alone would have approved this: raw moved ${fmtSigned(m.deltaRaw)}, past the ±${m.mdc95.toFixed(1)} floor.`
                      : `Raw moved ${fmtSigned(m.deltaRaw)}, inside the ±${m.mdc95.toFixed(1)} floor anyway.`}
                  </>
                )}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
