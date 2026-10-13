import { THRESHOLDS, type CaptureStats } from "./conditions";
import type { DemoPhoto } from "./demo-types";
import { IN_SAMPLE } from "./summary";

export interface CalibrationRow {
  id: string;
  label: string;
  measures: string;
  limit: string;
  /** Largest value seen between two shots at the same spot under the same light (desk spot or ceiling light). These must pass. */
  sameSetup: string;
  /** Range seen between photos from different setups (different room and light). */
  acrossSetups: string;
  /** Extra detail for one row, e.g. the range when the window was behind the head. */
  note?: string;
}

/** Column headings, shared by the page and the README table. */
export const CALIBRATION_COLUMNS = ["Check", "Limit", "Same spot and light, largest", "Different room and light, range"] as const;

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
type F = (a: CaptureStats, b: CaptureStats) => number;

/** Numbers behind THRESHOLDS, computed from the shipped demo photos. scripts/calibrate.ts prints the full version. */
export function calibrationTable(all: DemoPhoto[]): CalibrationRow[] {
  const photos = all.filter((p) => IN_SAMPLE.has(p.session));
  const same: Array<[CaptureStats, CaptureStats]> = [];
  const cross: Array<[CaptureStats, CaptureStats]> = [];
  const windowBehind: Array<[CaptureStats, CaptureStats]> = [];
  for (const a of photos)
    for (const b of photos) {
      if (a === b) continue;
      if (a.session === b.session && a.session !== "s2") same.push([a.capture, b.capture]);
      else if (a.session !== b.session) cross.push([a.capture, b.capture]);
      if (a.session !== b.session && (a.session === "s2" || b.session === "s2")) windowBehind.push([a.capture, b.capture]);
    }
  const sameMax = (f: F) => Math.max(...same.map(([a, b]) => f(a, b)));
  const range = (f: F, fmt: (v: number) => string, set = cross) => {
    const v = set.map(([a, b]) => f(a, b));
    return `${fmt(Math.min(...v))} to ${fmt(Math.max(...v))}`;
  };
  const lum: F = (a, b) => Math.abs(b.centerLum - a.centerLum) / a.centerLum;
  const ratio: F = (a, b) => Math.abs(b.backlightRatio - a.backlightRatio);
  const clip: F = (a, b) => Math.max(a.clippedBorder, b.clippedBorder);
  const rb: F = (a, b) => Math.abs(b.redBlue - a.redBlue) / a.redBlue;
  const r3 = (v: number) => v.toFixed(3);
  return [
    { id: "face-brightness", label: "Face brightness", measures: "Mean brightness of the central face region", limit: `±${pct(THRESHOLDS.faceLumRelative)}`, sameSetup: pct(sameMax(lum)), acrossSetups: range(lum, pct) },
    { id: "backlight-ratio", label: "Face vs background", measures: "Face brightness divided by the background beside the head", limit: `±${THRESHOLDS.backlightRatioDelta.toFixed(2)}`, sameSetup: r3(sameMax(ratio)), acrossSetups: range(ratio, r3) },
    { id: "backlit", label: "Backlight", measures: "Share of blown-out pixels in the background beside the head", limit: `${pct(THRESHOLDS.clippedBorder)} max`, sameSetup: pct(sameMax(clip)), acrossSetups: range(clip, pct), note: `${range(clip, pct, windowBehind)} when one photo has the window behind the head` },
    { id: "color-temperature", label: "Light colour", measures: "Red-to-blue ratio of the face region", limit: `±${pct(THRESHOLDS.redBlueRelative)}`, sameSetup: pct(sameMax(rb)), acrossSetups: range(rb, pct) },
  ];
}

/** The calibration table as Markdown, quoted verbatim in the README (checked by tests/docs-consistency.test.ts). */
export function calibrationMarkdown(rows: CalibrationRow[]): string {
  const NL = String.fromCharCode(10);
  const head = `| ${CALIBRATION_COLUMNS.join(" | ")} |${NL}|${CALIBRATION_COLUMNS.map(() => "---").join("|")}|`;
  const body = rows.map((r) => `| ${r.label} | ${r.limit} | ${r.sameSetup} | ${r.acrossSetups}${r.note ? `; ${r.note}` : ""} |`).join(NL);
  return `${head}${NL}${body}`;
}
