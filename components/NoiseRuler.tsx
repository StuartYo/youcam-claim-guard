import { fmtSigned } from "@/lib/noise";

const H = 84;
const PAD = 16;
const BAND_TOP = 26;
const BAND_H = 22;
const AXIS_Y = BAND_TOP + BAND_H + 4;
const ARROW_Y = BAND_TOP + BAND_H / 2;

function niceStep(d: number) {
  if (d <= 4) return 1;
  if (d <= 10) return 2;
  if (d <= 25) return 5;
  return 10;
}

/** Rough width of a mono label in viewBox units, used to keep it inside the frame. */
const textWidth = (s: string, size: number) => s.length * size * 0.6;

/**
 * Number line for one metric's raw-score change. The flat light band is the noise floor (±MDC95);
 * a solid arrow runs from 0 to the measured change and its value sits at the arrow end.
 * Inside the band the arrow is dark neutral, outside it takes the accent colour.
 */
export function NoiseRuler({ deltaRaw, mdc, label = "raw", width = 420 }: { deltaRaw: number; mdc: number; label?: string; width?: number }) {
  const W = width;
  const MID = W / 2;
  const HALF = W / 2 - PAD - 6;
  const outside = Math.abs(deltaRaw) > mdc;
  const reach = Math.max(Math.abs(deltaRaw) * 1.15, mdc * 1.8, 2);
  const step = niceStep(reach);
  const D = Math.ceil(reach / step) * step;
  const x = (v: number) => MID + (v / D) * HALF;
  const ticks: number[] = [];
  for (let v = -D; v <= D + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  const end = x(deltaRaw);
  const dir = deltaRaw >= 0 ? 1 : -1;
  const hasArrow = Math.abs(end - MID) > 6;

  // Value label at the arrow end, on the outer side of the head when it fits, otherwise flipped inward.
  const value = `${fmtSigned(deltaRaw)} ${label}`;
  const VS = 15;
  const vw = textWidth(value, VS);
  let vx = end + dir * 4;
  let anchor: "start" | "end" = dir > 0 ? "start" : "end";
  if (!hasArrow) {
    vx = MID;
    anchor = "start";
  }
  if (anchor === "start" && vx + vw > W - 2) {
    anchor = "end";
    vx = Math.min(end, W - 2);
  }
  if (anchor === "end" && vx - vw < 2) {
    anchor = "start";
    vx = Math.max(end, 2);
  }

  const bandLabel = `noise ±${mdc.toFixed(1)}`;

  return (
    <svg
      className={`ruler ${outside ? "ruler--out" : "ruler--in"}`}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Raw change ${fmtSigned(deltaRaw)} against a noise band of plus or minus ${mdc.toFixed(1)}: ${outside ? "outside" : "inside"} the band`}
    >
      <rect x={x(-mdc)} y={BAND_TOP} width={x(mdc) - x(-mdc)} height={BAND_H} className="ruler__band" rx={3} />
      <line x1={x(-D)} x2={x(D)} y1={AXIS_Y} y2={AXIS_Y} className="ruler__axis" />
      {ticks.map((t) => (
        <line key={t} x1={x(t)} x2={x(t)} y1={AXIS_Y} y2={AXIS_Y + (t === 0 ? 7 : 4)} className={t === 0 ? "ruler__zero" : "ruler__tick"} />
      ))}
      <line x1={MID} x2={MID} y1={BAND_TOP - 2} y2={AXIS_Y} className="ruler__zero" />
      <text x={x(-D)} y={H - 6} textAnchor="start" className="ruler__tick-label">
        {fmtSigned(-D, 0)}
      </text>
      <text x={x(D)} y={H - 6} textAnchor="end" className="ruler__tick-label">
        {fmtSigned(D, 0)}
      </text>
      <text x={MID} y={H - 6} textAnchor="middle" className="ruler__band-label">
        {bandLabel}
      </text>
      {hasArrow ? (
        <>
          <line x1={MID} x2={end - dir * 9} y1={ARROW_Y} y2={ARROW_Y} className="ruler__arrow" />
          <path d={`M ${end} ${ARROW_Y} l ${-dir * 12} -7.5 v 15 z`} className="ruler__head" />
        </>
      ) : (
        <circle cx={MID} cy={ARROW_Y} r={5} className="ruler__head" />
      )}
      <text x={vx} y={16} textAnchor={anchor} className="ruler__value">
        {value}
      </text>
    </svg>
  );
}
