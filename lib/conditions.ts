/**
 * Capture-conditions check. Pure functions only; pixel measurement lives in measure.ts.
 * Thresholds were calibrated on the developer's 15 photos (see scripts/calibrate.ts and the README).
 */
export interface CaptureStats {
  /** Mean luma (0-255) of the central face region. */
  centerLum: number;
  /** Mean luma of the background strips beside the head. */
  borderLum: number;
  /** centerLum / borderLum. Shifts when the light source moves from in front of the face to behind it. */
  backlightRatio: number;
  /** Share of background pixels that are blown out (luma >= 235). High means a window or lamp behind the person. */
  clippedBorder: number;
  /** Mean R / mean B in the face region. A proxy for the colour temperature of the light. */
  redBlue: number;
}

export const THRESHOLDS = {
  /** Max relative change in face brightness between before and after. */
  faceLumRelative: 0.1,
  /** Max absolute change in the face-to-background ratio. */
  backlightRatioDelta: 0.1,
  /** Max share of blown-out background in either photo. */
  clippedBorder: 0.15,
  /** Max relative change in the R/B colour proxy. */
  redBlueRelative: 0.02,
} as const;

export type Thresholds = { [K in keyof typeof THRESHOLDS]: number };

export type ConditionCheckId = "face-brightness" | "backlight-ratio" | "backlit" | "color-temperature";

export interface ConditionCheck {
  id: ConditionCheckId;
  label: string;
  pass: boolean;
  before: number;
  after: number;
  /** The measured difference, in the unit of the threshold. */
  delta: number;
  threshold: number;
  reason: string;
}

export interface ConditionsResult {
  match: boolean;
  checks: ConditionCheck[];
  /** Readable reasons for each failed check. Empty when match is true. */
  reasons: string[];
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export function compareConditions(before: CaptureStats, after: CaptureStats, t: Thresholds = THRESHOLDS): ConditionsResult {
  const lumRel = (after.centerLum - before.centerLum) / before.centerLum;
  const ratioD = after.backlightRatio - before.backlightRatio;
  const rbRel = (after.redBlue - before.redBlue) / before.redBlue;
  const clipMax = Math.max(before.clippedBorder, after.clippedBorder);
  const bBack = before.clippedBorder > t.clippedBorder;
  const aBack = after.clippedBorder > t.clippedBorder;
  const which = bBack && aBack ? "Both photos are" : bBack ? "The before photo is" : "The after photo is";

  const checks: ConditionCheck[] = [
    {
      id: "face-brightness",
      label: "Face brightness",
      pass: Math.abs(lumRel) <= t.faceLumRelative,
      before: before.centerLum,
      after: after.centerLum,
      delta: lumRel,
      threshold: t.faceLumRelative,
      reason: `The face is ${pct(Math.abs(lumRel))} ${lumRel > 0 ? "brighter" : "darker"} in the after photo (limit ${pct(t.faceLumRelative)}).`,
    },
    {
      id: "backlight-ratio",
      label: "Face vs background",
      pass: Math.abs(ratioD) <= t.backlightRatioDelta,
      before: before.backlightRatio,
      after: after.backlightRatio,
      delta: ratioD,
      threshold: t.backlightRatioDelta,
      reason: `Face-to-background brightness went from ${before.backlightRatio.toFixed(2)} to ${after.backlightRatio.toFixed(2)} (limit ±${t.backlightRatioDelta.toFixed(2)}), so the light source moved.`,
    },
    {
      id: "backlit",
      label: "Backlight",
      pass: clipMax <= t.clippedBorder,
      before: before.clippedBorder,
      after: after.clippedBorder,
      delta: clipMax,
      threshold: t.clippedBorder,
      reason: `${which} backlit: ${pct(clipMax)} of the background beside the head is blown out (limit ${pct(t.clippedBorder)}).`,
    },
    {
      id: "color-temperature",
      label: "Light colour",
      pass: Math.abs(rbRel) <= t.redBlueRelative,
      before: before.redBlue,
      after: after.redBlue,
      delta: rbRel,
      threshold: t.redBlueRelative,
      reason: `The light is ${rbRel > 0 ? "warmer" : "cooler"} in the after photo: red/blue ratio ${before.redBlue.toFixed(3)} to ${after.redBlue.toFixed(3)} (${pct(Math.abs(rbRel))}, limit ${pct(t.redBlueRelative)}).`,
    },
  ];
  const failed = checks.filter((c) => !c.pass);
  return { match: failed.length === 0, checks, reasons: failed.map((c) => c.reason) };
}
