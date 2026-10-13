import { NextResponse } from "next/server";
import { compareConditions } from "@/lib/conditions";
import { noiseModel } from "@/lib/demo";
import { measure } from "@/lib/measure";
import { evaluate } from "@/lib/noise";
import { creditGuard, sha256 } from "@/lib/server/guard";
import { clientIp, InputError, prepareImage, type PreparedImage } from "@/lib/server/image";
import { getApiKey } from "@/lib/server/key";
import { BodyTooLarge, formDataLimited, limiter, tooMany } from "@/lib/server/limits";

/** Two photos of up to 10 MB each plus form overhead. */
const MAX_BODY = 21 * 1024 * 1024;
import { analyzeSkin, YouCamError, type AnalysisResult } from "@/lib/server/youcam";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Paid step: runs the conditions check again, then YouCam SD skin analysis on each photo
 * that is not already cached. Requires confirm=1 when the conditions don't match.
 */
export async function POST(req: Request) {
  const guard = creditGuard();
  const ip = clientIp(req.headers);
  if (!getApiKey()) {
    return NextResponse.json({ error: "Live mode is not configured on this server. Use the demo cases." }, { status: 503 });
  }
  const rl = limiter("analyze", 6).take(ip);
  if (!rl.ok) return tooMany(rl.retryAfter);
  try {
    const form = await formDataLimited(req, MAX_BODY);
    const confirmed = form.get("confirm") === "1";
    const [b, a] = await Promise.all([
      prepareImage(form.get("before") as File | null, "before"),
      prepareImage(form.get("after") as File | null, "after"),
    ]);
    // Measure the uploaded bytes, not the re-encoded copy, so a demo photo gives exactly its stored stats.
    const [bs, as] = await Promise.all([measure(b.original), measure(a.original)]);
    const conditions = compareConditions(bs, as);
    if (!conditions.match && !confirmed) {
      return NextResponse.json({ error: "Capture conditions differ. Confirm to analyze anyway.", conditions }, { status: 409 });
    }

    const hb = sha256(b.original);
    const ha = sha256(a.original);
    const identical = hb === ha;
    const jobs: Array<{ hash: string; img: PreparedImage }> = [];
    if (!guard.getCached(hb)) jobs.push({ hash: hb, img: b });
    if (!identical && !guard.getCached(ha)) jobs.push({ hash: ha, img: a });

    const allowed = guard.check(ip, jobs.length);
    if (!allowed.ok) return NextResponse.json({ error: allowed.reason, limit: true }, { status: 429 });

    // Reserve every paid call right after the check, before any await, so parallel requests can't overshoot the cap.
    // A failed call still counts; that errs on the side of saving credits.
    for (let i = 0; i < jobs.length; i++) guard.record(ip);
    for (const job of jobs) guard.setCached(job.hash, await analyzeSkin(job.img.jpeg));
    const rb = guard.getCached(hb) as AnalysisResult;
    const ra = guard.getCached(ha) as AnalysisResult;
    return NextResponse.json({
      identical,
      conditions,
      before: { capture: bs, ...rb },
      after: { capture: as, ...ra },
      evaluation: evaluate({ before: rb.scores, after: ra.scores, conditions, noise: noiseModel, identical }),
      paidAnalyses: jobs.length,
      remaining: guard.remaining(ip),
    });
  } catch (e) {
    if (e instanceof BodyTooLarge) return NextResponse.json({ error: e.message }, { status: 413 });
    if (e instanceof InputError) return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof YouCamError) return NextResponse.json({ error: e.message }, { status: 502 });
    return NextResponse.json({ error: "Analysis failed. Try again, or use the demo cases." }, { status: 500 });
  }
}
