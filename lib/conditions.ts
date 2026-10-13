/**
 * Capture-conditions check. Pure functions only; pixel measurement lives in measure.ts.
 * Limits were set on the developer's first 15 photos (sessions 1 to 3, see scripts/calibrate.ts and the README).
 *
 * Version 2 (current). Version 1 measured light colour on the face and face brightness on its own. On the held-out
 * photos (session4) that blocked most same-lamp pairs before and after skincare: washing the face made it redder,
 * which version 1 read as warmer light, and the phone's exposure shifted face brightness. Version 2 reads light colour
 * from the background beside the head, which skincare does not touch, and divides face brightness by background
 * brightness, so a uniform exposure change cancels out. Because session4 motivated that change, it is no longer a
 * strict held-out set for version 2. Version 1 is kept (compareConditionsV1) so the frozen-limit numbers can still be
 * reported next to the new ones.
 */
export interface CaptureStats {
  /** Mean luma (0-255) of the central face region. */
  centerLum: number;
  /** Mean luma of the background strips beside the head. */
  borderLum: number;
  /** centerLum / borderLum. Face brightness relative to the background, so a uniform exposure change cancels out. */
  backlightRatio: number;
  /** Share of background pixels that are blown out (luma >= 235). High means a window or lamp behind the person. */
  clippedBorder: number;
  /** Mean R / mean B in the face region. Version 1 used this as the light colour; skin changes move it too. */
  redBlue: number;
  /** Mean R / mean B of the background strips, without blown-out pixels. Version 2 light colour. */
  bgRedBlue: number;
}

export const THRESHOLDS = {
  /** Max relative change in face brightness divided by background brightness. */
  faceLumRelative: 0.1,
  /** Max share of blown-out background in either photo. */
  clippedBorder: 0.15,
  /** Max relative change in the background R/B colour proxy. */
  redBlueRelative: 0.02,
} as const;

export type Thresholds = { [K in keyof typeof THRESHOLDS]: number };

/** Short id for the capture limits in force, written into every audit log row. */
export const CAPTURE_VERSION = "capture-v2";

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

function backlitCheck(before: CaptureStats, after: CaptureStats, limit: number): ConditionCheck {
  const clipMax = Math.max(before.clippedBorder, after.clippedBorder);
  const bBack = before.clippedBorder > limit;
  const aBack = after.clippedBorder > limit;
  const which = bBack && aBack ? "Both photos are" : bBack ? "The before photo is" : "The after photo is";
  return {
    id: "backlit",
    label: "Backlight",
    pass: clipMax <= limit,
    before: before.clippedBorder,
    after: after.clippedBorder,
    delta: clipMax,
    threshold: limit,
    reason: `${which} backlit: ${pct(clipMax)} of the background beside the head is blown out (limit ${pct(limit)}).`,
  };
}

function result(checks: ConditionCheck[]): ConditionsResult {
  const failed = checks.filter((c) => !c.pass);
  return { match: failed.length === 0, checks, reasons: failed.map((c) => c.reason) };
}

/** Current check (version 2): face brightness relative to the background, backlight, background light colour. */
export function compareConditions(before: CaptureStats, after: CaptureStats, t: Thresholds = THRESHOLDS): ConditionsResult {
  const lumRel = (after.backlightRatio - before.backlightRatio) / before.backlightRatio;
  const rbRel = (after.bgRedBlue - before.bgRedBlue) / before.bgRedBlue;
  return result([
    {
      id: "face-brightness",
      label: "Face brightness",
      pass: Math.abs(lumRel) <= t.faceLumRelative,
      before: before.backlightRatio,
      after: after.backlightRatio,
      delta: lumRel,
      threshold: t.faceLumRelative,
      reason: `Relative to the background, the face is ${pct(Math.abs(lumRel))} ${lumRel > 0 ? "brighter" : "darker"} in the after photo (limit ${pct(t.faceLumRelative)}), so the light on the face changed.`,
    },
    backlitCheck(before, after, t.clippedBorder),
    {
      id: "color-temperature",
      label: "Light colour",
      pass: Math.abs(rbRel) <= t.redBlueRelative,
      before: before.bgRedBlue,
      after: after.bgRedBlue,
      delta: rbRel,
      threshold: t.redBlueRelative,
      reason: `The light is ${rbRel > 0 ? "warmer" : "cooler"} in the after photo: background red/blue ratio ${before.bgRedBlue.toFixed(3)} to ${after.bgRedBlue.toFixed(3)} (${pct(Math.abs(rbRel))}, limit ${pct(t.redBlueRelative)}).`,
    },
  ]);
}

/** Version 1 limits, frozen on sessions 1 to 3 and used for the first held-out report. Reporting only. */
export const THRESHOLDS_V1 = { faceLumRelative: 0.1, backlightRatioDelta: 0.1, clippedBorder: 0.15, redBlueRelative: 0.02 } as const;

/** Version 1 check, kept so the held-out numbers before the change can be reproduced. Not used for verdicts. */
export function compareConditionsV1(before: CaptureStats, after: CaptureStats): ConditionsResult {
  const t = THRESHOLDS_V1;
  const lumRel = (after.centerLum - before.centerLum) / before.centerLum;
  const ratioD = after.backlightRatio - before.backlightRatio;
  const rbRel = (after.redBlue - before.redBlue) / before.redBlue;
  return result([
    { id: "face-brightness", label: "Face brightness", pass: Math.abs(lumRel) <= t.faceLumRelative, before: before.centerLum, after: after.centerLum, delta: lumRel, threshold: t.faceLumRelative, reason: `Face ${pct(Math.abs(lumRel))} ${lumRel > 0 ? "brighter" : "darker"}.` },
    { id: "backlight-ratio", label: "Face vs background", pass: Math.abs(ratioD) <= t.backlightRatioDelta, before: before.backlightRatio, after: after.backlightRatio, delta: ratioD, threshold: t.backlightRatioDelta, reason: `Face-to-background ratio moved ${ratioD.toFixed(2)}.` },
    backlitCheck(before, after, t.clippedBorder),
    { id: "color-temperature", label: "Light colour", pass: Math.abs(rbRel) <= t.redBlueRelative, before: before.redBlue, after: after.redBlue, delta: rbRel, threshold: t.redBlueRelative, reason: `Face red/blue moved ${pct(Math.abs(rbRel))}.` },
  ]);
}
