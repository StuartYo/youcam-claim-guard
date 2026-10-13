import type { CaptureStats } from "./conditions";
import type { Scores } from "./noise";

export interface DemoPhoto {
  id: string;
  session: "s1" | "s2" | "s3";
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
  effect: string;
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
  simulated?: SimulatedPhoto[];
}
