/**
 * The whole Claim Guard check in one call, shared by POST /api/v1/claim-check and the MCP server (mcp/server.ts).
 * Takes the YouCam scores a brand already has plus both photos; makes no YouCam call.
 */
import { createHash } from "node:crypto";
import noiseJson from "../data/noise-model.json";
import { toClaimCheckResponse, type ClaimCheckResponse } from "./brand-api";
import type { ProductCategory } from "./claim-policy";
import { CAPTURE_VERSION, compareConditions, THRESHOLDS } from "./conditions";
import { measure } from "./measure";
import { evaluate, METRICS, type NoiseModel, type Scores } from "./noise";

const noiseModel = noiseJson.metrics as NoiseModel;

export interface ClaimCheckInput {
  before: Scores;
  after: Scores;
  beforeImage: Buffer;
  afterImage: Buffer;
  product?: ProductCategory;
}

export async function claimCheck(input: ClaimCheckInput): Promise<ClaimCheckResponse> {
  const [bs, as] = await Promise.all([measure(input.beforeImage), measure(input.afterImage)]);
  const conditions = compareConditions(bs, as);
  const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
  const identical = hash(input.beforeImage) === hash(input.afterImage);
  const ev = evaluate({ before: input.before, after: input.after, conditions, noise: noiseModel, identical, product: input.product });
  return toClaimCheckResponse(conditions, ev);
}

/** The limits in force, for audit logs and the explain_thresholds MCP tool. */
export function thresholdsInUse() {
  return {
    capture_version: CAPTURE_VERSION,
    capture: {
      face_brightness_vs_background_max_change: THRESHOLDS.faceLumRelative,
      blown_out_background_max_share: THRESHOLDS.clippedBorder,
      background_light_colour_max_change: THRESHOLDS.redBlueRelative,
    },
    noise_floor_raw_mdc95: Object.fromEntries(METRICS.map((m) => [m, noiseModel[m].mdc95])),
    min_display_change_points: 1,
  };
}
