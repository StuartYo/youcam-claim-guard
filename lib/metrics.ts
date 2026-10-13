export const METRICS = ["moisture", "pore", "wrinkle", "radiance"] as const;
export type Metric = (typeof METRICS)[number];

export const METRIC_LABEL: Record<Metric, string> = {
  moisture: "Moisture",
  pore: "Pore",
  wrinkle: "Wrinkle",
  radiance: "Radiance",
};
