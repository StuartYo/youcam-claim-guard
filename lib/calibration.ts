import { THRESHOLDS, type CaptureStats } from "./conditions";
import type { DemoPhoto } from "./demo-types";

export interface CalibrationRow {
  id: string;
  label: string;
  measures: string;
  limit: string;
  /** Largest value seen between two same-light shots (session1). These must pass. */
  sameLight: string;
  /** Range seen between photos taken under different light. */
  lightChange: string;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
type F = (a: CaptureStats, b: CaptureStats) => number;

/** Numbers behind THRESHOLDS, computed from the shipped demo photos. scripts/calibrate.ts prints the full version. */
export function calibrationTable(photos: DemoPhoto[]): CalibrationRow[] {
  const same: Array<[CaptureStats, CaptureStats]> = [];
  const cross: Array<[CaptureStats, CaptureStats]> = [];
  for (const a of photos)
    for (const b of photos) {
      if (a === b) continue;
      if (a.session === "s1" && b.session === "s1") same.push([a.capture, b.capture]);
      else if (a.session !== b.session) cross.push([a.capture, b.capture]);
    }
  const sameMax = (f: F) => Math.max(...same.map(([a, b]) => f(a, b)));
  const range = (f: F, fmt: (v: number) => string) => {
    const v = cross.map(([a, b]) => f(a, b));
    return `${fmt(Math.min(...v))} to ${fmt(Math.max(...v))}`;
  };
  const lum: F = (a, b) => Math.abs(b.centerLum - a.centerLum) / a.centerLum;
  const ratio: F = (a, b) => Math.abs(b.backlightRatio - a.backlightRatio);
  const clip: F = (a, b) => Math.max(a.clippedBorder, b.clippedBorder);
  const rb: F = (a, b) => Math.abs(b.redBlue - a.redBlue) / a.redBlue;
  const r3 = (v: number) => v.toFixed(3);
  return [
    { id: "face-brightness", label: "Face brightness", measures: "Mean brightness of the central face region", limit: `±${pct(THRESHOLDS.faceLumRelative)}`, sameLight: pct(sameMax(lum)), lightChange: range(lum, pct) },
    { id: "backlight-ratio", label: "Face vs background", measures: "Face brightness divided by the background beside the head", limit: `±${THRESHOLDS.backlightRatioDelta.toFixed(2)}`, sameLight: r3(sameMax(ratio)), lightChange: range(ratio, r3) },
    { id: "backlit", label: "Backlight", measures: "Share of blown-out pixels in the background beside the head", limit: `${pct(THRESHOLDS.clippedBorder)} max`, sameLight: pct(sameMax(clip)), lightChange: range(clip, pct) },
    { id: "color-temperature", label: "Light colour", measures: "Red-to-blue ratio of the face region", limit: `±${pct(THRESHOLDS.redBlueRelative)}`, sameLight: pct(sameMax(rb)), lightChange: range(rb, pct) },
  ];
}
