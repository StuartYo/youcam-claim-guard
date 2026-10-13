import { APPEARANCE_LABEL, CLAIM_POLICY } from "@/lib/claim-policy";
import type { ConditionsResult } from "@/lib/conditions";
import { badgeText, fmtSigned, pctText, roundPct, METRIC_HINT, METRIC_LABEL, type Evaluation, type Verdict } from "@/lib/noise";
import { NoiseRuler } from "./NoiseRuler";

export interface PanelSide {
  image: string;
  caption: string;
}

const VERDICT_LABEL: Record<Verdict, string> = {
  claimable: "Claimable",
  "within-noise": "Within noise",
  "no-visible-change": "No visible change",
  "blocked-conditions": "Blocked: photos not comparable",
  "blocked-claim-type": "Blocked: claim type",
};

export function verdictLabel(v: Verdict) {
  return VERDICT_LABEL[v];
}

export function Mark({ ok }: { ok: boolean }) {
  return (
    <svg className={`mark ${ok ? "mark--ok" : "mark--no"}`} viewBox="0 0 16 16" aria-hidden="true">
      {ok ? <path d="M3.5 8.5l3 3 6-7" /> : <path d="M4 4l8 8M12 4l-8 8" />}
    </svg>
  );
}

function fmtCheckValue(id: string, v: number) {
  if (id === "backlit") return `${(v * 100).toFixed(1)}%`;
  if (id === "face-brightness") return v.toFixed(2);
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
}: {
  before: PanelSide;
  after: PanelSide;
  conditions: ConditionsResult;
  evaluation: Evaluation;
}) {
  const shown = evaluation.metrics.filter((m) => roundPct(m.deltaUiPct) !== 0);
  const confirmed = evaluation.metrics.filter((m) => m.verdict === "claimable");
  // A confirmed drop is real, but it is not a gain a badge can claim.
  const allowed = confirmed.filter((m) => m.deltaUi > 0);
  const drops = confirmed.filter((m) => m.deltaUi < 0);
  const notAllowed = shown.filter((m) => m.verdict !== "claimable");
  const anyBlocked = evaluation.metrics.some((m) => m.verdict.startsWith("blocked"));
  const tone = allowed.length ? "is-ok" : !conditions.match ? "is-blocked" : "is-neutral";
  const product = evaluation.product;

  return (
    <div className="panel">
      <div className="panel__top">
        <div className="photos">
          {(
            [
              ["Before", before],
              ["After", after],
            ] as const
          ).map(([label, side]) => (
            <figure key={label} className="photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={side.image} alt={`${label} photo: ${side.caption}`} width={540} height={720} loading="lazy" />
              <figcaption>
                <strong>{label}</strong> {side.caption}
              </figcaption>
            </figure>
          ))}
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
            {product && (
              <p className="decision__product">
                Product: <strong>{CLAIM_POLICY[product].label}</strong>
                {CLAIM_POLICY[product].makeup ? " (makeup)" : ""}
              </p>
            )}
          </div>
          <div className={`decision__verdict ${tone}`}>
            <p className="eyebrow">Claim Guard</p>
            {allowed.length ? (
              <>
                <p className="verdict-line">Badge allowed for {allowed.map((m) => METRIC_LABEL[m.metric].toLowerCase()).join(" and ")}</p>
                <div className="badges badges--verdict">
                  {allowed.map((m) => (
                    <span key={m.metric} className="badge badge--ok">
                      {badgeText(m.metric, m.deltaUiPct)}
                      {m.claimKind === "appearance" && <small>{APPEARANCE_LABEL}</small>}
                    </span>
                  ))}
                  {notAllowed.map((m) => (
                    <span key={m.metric} className="badge badge--held" title={m.reason}>
                      {badgeText(m.metric, m.deltaUiPct)}: {VERDICT_LABEL[m.verdict].toLowerCase()}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="verdict-line">
                {evaluation.identical ? "No change" : !conditions.match ? "Badge blocked" : "No gain to claim"}
                <span>
                  {evaluation.identical
                    ? "The two photos are the same file, so every metric is within noise."
                    : !conditions.match
                      ? "The capture check failed, so the two photos are not comparable."
                      : drops.length
                        ? `${drops.map((m) => METRIC_LABEL[m.metric]).join(" and ")} fell by more than retake noise. The other changes are within noise or not claimable for this product.`
                        : anyBlocked
                          ? "The changes are within noise or the product can't make these claims."
                          : "Every change is within the noise of a retake."}
                </span>
              </p>
            )}
          </div>
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
                <span className="metric__name">
                  {METRIC_LABEL[m.metric]}
                  <small>{METRIC_HINT[m.metric]}</small>
                </span>
                <span className="metric__ui">
                  score {m.before.ui} &rarr; {m.after.ui}
                  <em>{pctText(m.deltaUiPct)}</em>
                </span>
                <span className={`tag tag--${m.verdict === "claimable" && m.deltaUi < 0 ? "within-noise" : m.verdict}`}>
                  {m.verdict === "claimable" && m.deltaUi < 0 ? "Real drop: no badge" : VERDICT_LABEL[m.verdict]}
                </span>
              </div>
              <NoiseRuler deltaRaw={m.deltaRaw} mdc={m.mdc95} />
              <p className="metric__reason">
                {m.reason}
                {(m.verdict === "blocked-conditions" || m.verdict === "blocked-claim-type") && (
                  <>
                    {" "}
                    {m.aboveNoise
                      ? `A noise check alone would have allowed this: raw moved ${fmtSigned(m.deltaRaw)}, past the ±${m.mdc95.toFixed(1)} floor.`
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
