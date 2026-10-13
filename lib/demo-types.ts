import type { CaptureStats } from "./conditions";
import type { Scores } from "./noise";

export interface DemoPhoto {
  id: string;
  /** s1 desk spot, s2 window behind, s3 ceiling light (other room). s4: held-out photos from photos/session4/, never used to set limits. */
  session: "s1" | "s2" | "s3" | "s4";
  /** For s4 photos: the setup subfolder name under photos/session4/. */
  setup?: string;
  sessionLabel: string;
  image: string;
  capture: CaptureStats;
  scores: Scores;
  overall?: number;
  skinAge?: number;
}

/** A photo edited by a YouCam effect (not a new capture). Kept out of `photos` so it never enters the noise model or calibration. */
export interface SimulatedPhoto {
  id: string;
  /** The untouched session photo the effect was applied to. */
  sourceId: string;
  /** The baseline analyzed after the same resize as the effect's input. Use this as "before". */
  baselineId?: string;
  effect: string;
  image: string;
  capture: CaptureStats;
  scores: Scores;
  overall?: number;
  skinAge?: number;
}

/** An untouched photo re-encoded the same way as a simulated photo's input. Not a new capture, so it stays out of the noise model. */
export interface BaselinePhoto {
  id: string;
  sourceId: string;
  note: string;
  image: string;
  capture: CaptureStats;
  scores: Scores;
  overall?: number;
  skinAge?: number;
}

export interface DemoData {
  source: string;
  photos: DemoPhoto[];
  duplicates: Array<{ id: string; note: string; scores: Scores; overall?: number; skinAge?: number }>;
  baselines?: BaselinePhoto[];
  simulated?: SimulatedPhoto[];
  /** Held-out photos (session4). Kept apart from `photos` so they never enter the noise model or the in-sample calibration. */
  heldOut?: DemoPhoto[];
  /**
   * Hook for the headline case: two held-out photos taken at the same spot where only the lamp changed.
   * When present, lib/demo.ts puts this case first and the hero shows it.
   */
  lampOnly?: { beforeId: string; afterId: string; beforeNote: string; afterNote: string };
}
