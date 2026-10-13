import { NextResponse } from "next/server";
import { isProductCategory, PRODUCT_CATEGORIES, type ProductCategory } from "@/lib/claim-policy";
import { compareConditions } from "@/lib/conditions";
import { noiseModel } from "@/lib/demo";
import { measure } from "@/lib/measure";
import { evaluate } from "@/lib/noise";
import { creditGuard, liveEnabled, sha256 } from "@/lib/server/guard";
import { clientIp, InputError, prepareImage, type PreparedImage } from "@/lib/server/image";
import { getApiKey } from "@/lib/server/key";
import { BodyTooLarge, formDataLimited, limiter, MAX_FORM_BODY, tooMany } from "@/lib/server/limits";
import { analyzeSkin, YouCamError, type AnalysisResult } from "@/lib/server/youcam";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

/**
 * Paid step: runs the conditions check again, then YouCam SD skin analysis on each photo that is not already cached.
 * Form fields: before, after (JPEG or PNG files), consent=1 (required), product_category (optional), confirm=1 (required
 * when the capture conditions differ). Input is validated before anything is decoded or paid for.
 */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  const rl = limiter("analyze", 6).take(ip);
  if (!rl.ok) return tooMany(rl.retryAfter);

  let form: FormData;
  try {
    if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")) {
      return bad("Send multipart/form-data with two photos named before and after, and consent=1.");
    }
    form = await formDataLimited(req, MAX_FORM_BODY);
  } catch (e) {
    if (e instanceof BodyTooLarge) return NextResponse.json({ error: e.message }, { status: 413 });
    return bad("The form data could not be read. Send multipart/form-data with two photos named before and after.");
  }

  const before = form.get("before");
  const after = form.get("after");
  if (!(before instanceof File) || !(after instanceof File)) return bad("Both photos are required: form fields before and after.");
  // Consent is enforced here, not only in the browser: nothing goes to YouCam without it.
  if (form.get("consent") !== "1") return bad("Consent is required before photos are sent to YouCam: set consent=1.");
  const rawProduct = form.get("product_category");
  let product: ProductCategory | undefined;
  if (rawProduct !== null && rawProduct !== "") {
    if (!isProductCategory(rawProduct)) return bad(`product_category must be one of: ${PRODUCT_CATEGORIES.join(", ")}.`);
    product = rawProduct;
  }
  const confirmed = form.get("confirm") === "1";

  if (!liveEnabled()) {
    return NextResponse.json({ error: "Live analysis is switched off on this deployment. The demo cases use real results." }, { status: 503 });
  }
  if (!getApiKey()) {
    return NextResponse.json({ error: "Live mode is not configured on this server. Use the demo cases." }, { status: 503 });
  }

  const guard = creditGuard();
  try {
    const [b, a] = await Promise.all([prepareImage(before, "before"), prepareImage(after, "after")]);
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
      request_id: `live-${ha.slice(0, 8)}-${hb.slice(0, 8)}`,
      checked_at: new Date().toISOString(),
      identical,
      conditions,
      before: { capture: bs, ...rb },
      after: { capture: as, ...ra },
      evaluation: evaluate({ before: rb.scores, after: ra.scores, conditions, noise: noiseModel, identical, product }),
      paidAnalyses: jobs.length,
      remaining: guard.remaining(ip),
    });
  } catch (e) {
    if (e instanceof InputError) return bad(e.message);
    if (e instanceof YouCamError) return NextResponse.json({ error: e.message }, { status: 502 });
    return NextResponse.json({ error: "Analysis failed. Try again, or use the demo cases." }, { status: 500 });
  }
}
