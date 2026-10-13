/**
 * Writes the raw YouCam skin-analysis responses for the demo photos to public/demo/youcam/<id>.json,
 * so the page can show real API output without spending credits.
 * Only change: signed URLs are removed (they expired two hours after the call). Scores are untouched.
 * Usage: npx tsx scripts/export-cached.ts   (also run by npm run data:import)
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
/** results/<dir> -> photo ids. The first file for an id wins (test1 holds the first IMG_1406 call). */
const DIRS = ["test1", "s1", "s2", "s3", "vto_before", "vto"];

function strip(o: unknown): unknown {
  if (Array.isArray(o)) return o.map(strip);
  if (o && typeof o === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) out[k] = k === "mask_urls" && Array.isArray(v) ? v.map(() => "<signed URL removed>") : strip(v);
    return out;
  }
  // Any other URL (signed links can appear in other fields) is removed too.
  if (typeof o === "string" && /^https?:\/\//.test(o)) return "<URL removed>";
  return o;
}

export function exportCached() {
  const outDir = path.join(ROOT, "public", "demo", "youcam");
  mkdirSync(outDir, { recursive: true });
  const seen = new Set<string>();
  for (const d of DIRS) {
    const dir = path.join(ROOT, "results", d);
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
      const id = f.replace(/^\d+_/, "").replace(/\.json$/, "");
      if (seen.has(id)) continue;
      seen.add(id);
      const text = readFileSync(path.join(dir, f), "utf-8");
      const date = /X-Amz-Date=(\d{4})(\d{2})(\d{2})T/.exec(text);
      const response = strip(JSON.parse(text));
      const cached = {
        cached: {
          photo: id,
          fetched: date ? `${date[1]}-${date[2]}-${date[3]}` : null,
          endpoint: "GET /s2s/v2.0/task/skin-analysis/{task_id} (SD, dst_actions moisture,pore,wrinkle,radiance)",
          note: "Response as returned by YouCam. Signed mask URLs removed; they expired two hours after the call.",
        },
        response,
      };
      writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(cached, null, 1) + "\n");
    }
  }
  console.log(`wrote ${seen.size} cached responses to public/demo/youcam/`);
}

if (require.main === module) exportCached();
