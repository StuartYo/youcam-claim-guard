import { useId } from "react";
import { fmtSigned, type Verdict } from "@/lib/noise";

const W = 420;
const H = 74;
const MID = W / 2;
const HALF = W / 2 - 22;
const AXIS_Y = 48;

function niceStep(d: number) {
  if (d <= 4) return 1;
  if (d <= 10) return 2;
  if (d <= 25) return 5;
  return 10;
}

/**
 * Number line for one metric's raw-score change. The hatched band is the noise floor (±MDC95);
 * the arrow runs from 0 to the measured change.
 */
export function NoiseRuler({ deltaRaw, mdc, verdict, label = "raw" }: { deltaRaw: number; mdc: number; verdict: Verdict; label?: string }) {
  const id = useId().replace(/:/g, "");
  const reach = Math.max(Math.abs(deltaRaw) * 1.15, mdc * 1.8, 2);
  const step = niceStep(reach);
  const D = Math.ceil(reach / step) * step;
  const x = (v: number) => MID + (v / D) * HALF;
  const ticks: number[] = [];
  for (let v = -D; v <= D + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  const end = x(deltaRaw);
  const dir = deltaRaw >= 0 ? 1 : -1;
  const hasArrow = Math.abs(end - MID) > 6;
  const valueX = Math.min(Math.max(end, 44), W - 44);

  return (
    <svg className={`ruler ruler--${verdict}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Raw change ${fmtSigned(deltaRaw)} against a noise band of plus or minus ${mdc.toFixed(1)}`}>
      <defs>
        <pattern id={`h${id}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" className="ruler__band-bg" />
          <line x1="0" y1="0" x2="0" y2="6" className="ruler__hatch" />
        </pattern>
      </defs>
      <rect x={x(-mdc)} y={AXIS_Y - 16} width={x(mdc) - x(-mdc)} height={22} fill={`url(#h${id})`} className="ruler__band" />
      <text x={MID} y={AXIS_Y - 20} className="ruler__band-label" textAnchor="middle">
        noise ±{mdc.toFixed(1)}
      </text>
      <line x1={x(-D)} x2={x(D)} y1={AXIS_Y + 6} y2={AXIS_Y + 6} className="ruler__axis" />
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={AXIS_Y + 6} y2={AXIS_Y + (t === 0 ? -18 : 11)} className={t === 0 ? "ruler__zero" : "ruler__tick"} />
          {(t === -D || t === D || t === 0) && (
            <text x={x(t)} y={H - 2} textAnchor="middle" className="ruler__tick-label">
              {t === 0 ? "0" : fmtSigned(t, 0)}
            </text>
          )}
        </g>
      ))}
      {hasArrow ? (
        <>
          <line x1={MID} x2={end - dir * 7} y1={AXIS_Y - 5} y2={AXIS_Y - 5} className="ruler__arrow" />
          <path d={`M ${end} ${AXIS_Y - 5} l ${-dir * 9} -5.5 v 11 z`} className="ruler__head" />
        </>
      ) : (
        <circle cx={MID} cy={AXIS_Y - 5} r={4} className="ruler__head" />
      )}
      <text x={valueX} y={12} textAnchor="middle" className="ruler__value">
        {fmtSigned(deltaRaw)} {label}
      </text>
    </svg>
  );
}
