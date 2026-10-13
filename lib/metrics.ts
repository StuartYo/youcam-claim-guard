export const METRICS = ["moisture", "pore", "wrinkle", "radiance"] as const;
export type Metric = (typeof METRICS)[number];

/** Short names for prose and table rows. */
export const METRIC_LABEL: Record<Metric, string> = {
  moisture: "Moisture",
  pore: "Pore",
  wrinkle: "Wrinkle",
  radiance: "Radiance",
};

/**
 * All four YouCam scores are higher-is-better: a higher wrinkle score means fewer wrinkles.
 * "Wrinkle +12%" reads as "more wrinkles", so badges name the improvement and keep the score name in brackets.
 */
export const BADGE_LABEL: Record<Metric, string> = {
  moisture: "Moisture",
  pore: "Less visible pores (pore score)",
  wrinkle: "Smoother skin (wrinkle score)",
  radiance: "Radiance",
};

/** What a higher score means, shown next to the metric name. */
export const METRIC_HINT: Record<Metric, string> = {
  moisture: "higher score = more hydrated",
  pore: "higher score = less visible pores",
  wrinkle: "higher score = fewer wrinkles",
  radiance: "higher score = more radiant",
};
