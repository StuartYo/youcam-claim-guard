/**
 * One-off importer: raw API results + full-size photos (both gitignored) -> compact committed data.
 *   results/{test1,s1,s2,s3}/*.json  ->  data/scores.json
 *   photos/session{1,2,3}/*.jpg      ->  public/demo/*.jpg (720px long side) + capture stats
 * Then regenerates data/noise-model.json.
 * Usage: npm run data:import
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { measure } from "../lib/measure";
import { METRICS, type Scores } from "../lib/noise";
import type { DemoData, DemoPhoto } from "../lib/demo-types";
import { writeNoiseModel } from "./gen-noise-model";

const ROOT = path.resolve(__dirname, "..");
const SESSIONS = [
  { id: "s1", dir: "session1", label: "Same spot, same light", results: ["test1", "s1"] },
  { id: "s2", dir: "session2", label: "Window behind (backlit)", results: ["s2"] },
  { id: "s3", dir: "session3", label: "Ceiling light", results: ["s3"] },
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

  const data: DemoData = {
    source: "YouCam SD skin analysis, 2026-10-13, dst_actions moisture,pore,wrinkle,radiance. Developer's own photos, used with consent.",
    photos,
    duplicates,
  };
  writeFileSync(path.join(ROOT, "data", "scores.json"), JSON.stringify(data, null, 1) + "\n");
  console.log(`wrote data/scores.json (${photos.length} photos, ${duplicates.length} duplicate)`);
  writeNoiseModel();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
