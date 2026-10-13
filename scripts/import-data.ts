/**
 * One-off importer: raw API results + full-size photos (both gitignored) -> compact committed data.
 *   results/{test1,s1,s2,s3}/*.json  ->  data/scores.json
 *   photos/session{1,2,3}/*.jpg      ->  public/demo/*.jpg (720px long side) + capture stats
 *   results/vto_before/*.json + photos/vto/IMG_1407_1920.jpg -> baseline for the positive control (same resize as the VTO input)
 *   results/vto/*.json + photos/vto/*.jpg -> simulated photos (YouCam makeup VTO output, see docs/positive-control-2026-10-13.md)
 * Then regenerates data/noise-model.json.
 * Usage: npm run data:import
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { measure } from "../lib/measure";
import { METRICS, type Scores } from "../lib/noise";
import type { BaselinePhoto, DemoData, DemoPhoto, SimulatedPhoto } from "../lib/demo-types";
import { writeNoiseModel } from "./gen-noise-model";

const ROOT = path.resolve(__dirname, "..");
const SESSIONS = [
  { id: "s1", dir: "session1", label: "Desk spot", results: ["test1", "s1"] },
  { id: "s2", dir: "session2", label: "Window behind (backlit)", results: ["s2"] },
  { id: "s3", dir: "session3", label: "Ceiling light", results: ["s3"] },
] as const;

/**
 * Untouched photos re-encoded exactly like a simulated photo's input, analyzed on their own.
 * The positive control compares against this, so the resize is the same on both sides and only the effect differs.
 */
const BASELINES = [
  { id: "IMG_1407_1920", sourceId: "IMG_1407", note: "IMG_1407 resized to 1440 x 1920, the exact file sent to the virtual try-on", results: "vto_before", photoDir: "vto" },
] as const;

/** Photos edited with YouCam makeup virtual try-on. Not captures, so they stay out of the noise model. */
const SIMULATED = [
  {
    id: "IMG_1407_foundation1",
    sourceId: "IMG_1407",
    baselineId: "IMG_1407_1920",
    effect: "YouCam makeup virtual try-on, foundation (color #A87C66, color 25, glow 60, coverage 80)",
  },
] as const;

function parseScores(file: string): { scores: Scores; overall?: number; skinAge?: number } {
  const j = JSON.parse(readFileSync(file, "utf-8"));
  const out: Scores = {};
  let overall: number | undefined;
  let skinAge: number | undefined;
  for (const o of j.data.results.output as Array<Record<string, unknown>>) {
    const t = o.type as string;
    if ((METRICS as readonly string[]).includes(t) && typeof o.raw_score === "number") {
      out[t as (typeof METRICS)[number]] = { ui: o.ui_score as number, raw: Math.round((o.raw_score as number) * 1000) / 1000 };
    } else if (t === "all") overall = o.score as number;
    else if (t === "skin_age") skinAge = o.score as number;
  }
  return { scores: out, overall, skinAge };
}

async function main() {
  const outImg = path.join(ROOT, "public", "demo");
  mkdirSync(outImg, { recursive: true });
  mkdirSync(path.join(ROOT, "data"), { recursive: true });
  const photos: DemoPhoto[] = [];
  const duplicates: DemoData["duplicates"] = [];

  for (const s of SESSIONS) {
    const seen = new Set<string>();
    for (const r of s.results) {
      const dir = path.join(ROOT, "results", r);
      for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
        const id = f.replace(/^\d+_/, "").replace(/\.json$/, "");
        const parsed = parseScores(path.join(dir, f));
        if (seen.has(id)) {
          duplicates.push({ id, note: "Same file submitted a second time", ...parsed });
          continue;
        }
        seen.add(id);
        const src = path.join(ROOT, "photos", s.dir, `${id}.jpg`);
        if (!existsSync(src)) throw new Error(`missing photo ${src}`);
        const dst = path.join(outImg, `${id}.jpg`);
        await sharp(src).rotate().resize(720, 720, { fit: "inside" }).jpeg({ quality: 80, mozjpeg: true }).toFile(dst);
        const capture = await measure(dst);
        photos.push({ id, session: s.id, sessionLabel: s.label, image: `/demo/${id}.jpg`, capture, ...parsed });
        console.log(s.id, id, JSON.stringify(parsed.scores.moisture), JSON.stringify(capture));
      }
    }
  }

  const baselines: BaselinePhoto[] = [];
  for (const s of BASELINES) {
    const dir = path.join(ROOT, "results", s.results);
    const resultFile = readdirSync(dir).find((f) => f.replace(/^\d+_/, "") === `${s.id}.json`);
    if (!resultFile) throw new Error(`missing results/${s.results}/*_${s.id}.json`);
    const parsed = parseScores(path.join(dir, resultFile));
    const dst = path.join(outImg, `${s.id}.jpg`);
    await sharp(path.join(ROOT, "photos", s.photoDir, `${s.id}.jpg`)).rotate().resize(720, 720, { fit: "inside" }).jpeg({ quality: 80, mozjpeg: true }).toFile(dst);
    const capture = await measure(dst);
    baselines.push({ id: s.id, sourceId: s.sourceId, note: s.note, image: `/demo/${s.id}.jpg`, capture, ...parsed });
    console.log("baseline", s.id, JSON.stringify(parsed.scores), JSON.stringify(capture));
  }

  const simulated: SimulatedPhoto[] = [];
  for (const s of SIMULATED) {
    const resultFile = readdirSync(path.join(ROOT, "results", "vto")).find((f) => f.replace(/^\d+_/, "") === `${s.id}.json`);
    if (!resultFile) throw new Error(`missing results/vto/*_${s.id}.json`);
    const parsed = parseScores(path.join(ROOT, "results", "vto", resultFile));
    const dst = path.join(outImg, `${s.id}.jpg`);
    await sharp(path.join(ROOT, "photos", "vto", `${s.id}.jpg`)).rotate().resize(720, 720, { fit: "inside" }).jpeg({ quality: 80, mozjpeg: true }).toFile(dst);
    const capture = await measure(dst);
    simulated.push({ ...s, image: `/demo/${s.id}.jpg`, capture, ...parsed });
    console.log("vto", s.id, JSON.stringify(parsed.scores), JSON.stringify(capture));
  }

  const data: DemoData = {
    source: "YouCam SD skin analysis, 2026-10-13, dst_actions moisture,pore,wrinkle,radiance. Developer's own photos, used with consent.",
    photos,
    duplicates,
    baselines,
    simulated,
  };
  writeFileSync(path.join(ROOT, "data", "scores.json"), JSON.stringify(data, null, 1) + "\n");
  console.log(`wrote data/scores.json (${photos.length} photos, ${duplicates.length} duplicate)`);
  writeNoiseModel();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
