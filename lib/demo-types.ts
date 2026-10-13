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

export interface DemoData {
  source: string;
  photos: DemoPhoto[];
  duplicates: Array<{ id: string; note: string; scores: Scores; overall?: number; skinAge?: number }>;
}
