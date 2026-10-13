import "server-only";
import { getApiKey } from "./key";
import { METRICS, type Metric, type Scores } from "../noise";

const BASE = "https://yce-api-01.makeupar.com";
export const DST_ACTIONS: readonly Metric[] = ["moisture", "pore", "wrinkle", "radiance"];
/** SD skin analysis with 1-4 concerns costs 9 units per photo. */
export const UNITS_PER_ANALYSIS = 9;

export class YouCamError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

async function call(method: string, path: string, body?: unknown) {
  const key = getApiKey();
  if (!key) throw new YouCamError("Live mode is not configured on this server.");
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) throw new YouCamError(`YouCam API returned ${res.status} on ${path.split("/").slice(0, 5).join("/")}`, res.status);
  return json as { data?: Record<string, unknown> } | null;
}

async function upload(jpeg: Buffer): Promise<string> {
  const r = await call("POST", "/s2s/v2.0/file", {
    files: [{ content_type: "image/jpeg", file_name: "photo.jpg", file_size: jpeg.length }],
  });
  const f = (r?.data?.files as Array<{ file_id: string; requests: Array<{ url: string; method?: string; headers?: Record<string, string> }> }>)?.[0];
  if (!f) throw new YouCamError("Upload init returned no file slot.");
  const rq = f.requests[0];
  const put = await fetch(rq.url, {
    method: rq.method ?? "PUT",
    headers: rq.headers ?? { "Content-Type": "image/jpeg" },
    body: new Uint8Array(jpeg),
  });
  if (!put.ok) throw new YouCamError(`Photo upload failed with ${put.status}.`, put.status);
  return f.file_id;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface AnalysisResult {
  scores: Scores;
  overall?: number;
  skinAge?: number;
}

export function parseOutput(output: Array<Record<string, unknown>>): AnalysisResult {
  const scores: Scores = {};
  let overall: number | undefined;
  let skinAge: number | undefined;
  for (const o of output) {
    const t = o.type as string;
    if ((METRICS as readonly string[]).includes(t) && typeof o.raw_score === "number" && typeof o.ui_score === "number") {
      scores[t as Metric] = { ui: o.ui_score, raw: Math.round(o.raw_score * 1000) / 1000 };
    } else if (t === "all" && typeof o.score === "number") overall = o.score;
    else if (t === "skin_age" && typeof o.score === "number") skinAge = o.score;
  }
  return { scores, overall, skinAge };
}

/** Upload one JPEG and run SD skin analysis on it. Units are charged by YouCam only on success. */
export async function analyzeSkin(jpeg: Buffer): Promise<AnalysisResult> {
  const fileId = await upload(jpeg);
  const task = await call("POST", "/s2s/v2.0/task/skin-analysis", {
    src_file_id: fileId,
    dst_actions: DST_ACTIONS,
    format: "json",
  });
  const taskId = task?.data?.task_id as string | undefined;
  if (!taskId) throw new YouCamError("Skin analysis task was not created.");
  for (let i = 0; i < 40; i++) {
    await sleep(i === 0 ? 2000 : 2500);
    const r = await call("GET", `/s2s/v2.0/task/skin-analysis/${encodeURIComponent(taskId)}`);
    const status = r?.data?.task_status;
    if (status === "success") {
      const output = ((r?.data?.results as { output?: unknown[] })?.output ?? []) as Array<Record<string, unknown>>;
      return parseOutput(output);
    }
    if (status === "error") {
      const err = r?.data?.error;
      throw new YouCamError(`Skin analysis failed${typeof err === "string" ? `: ${err}` : ""}. Use a frontal photo with the forehead visible and even light.`);
    }
  }
  throw new YouCamError("Skin analysis timed out.");
}
