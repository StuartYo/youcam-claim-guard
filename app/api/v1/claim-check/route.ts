import { NextResponse } from "next/server";
import { MAX_BODY_BYTES, parseClaimCheckRequest, RequestError } from "@/lib/brand-api";
import { claimCheck } from "@/lib/claim-check";
import { clientIp } from "@/lib/server/image";
import { BodyTooLarge, limiter, readBodyLimited, tooMany } from "@/lib/server/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Requests per IP per minute. Each one decodes two images, so keep it modest. */
const PER_MINUTE = 30;

/**
 * Brand-facing check. The brand already has YouCam scores for both photos; it sends them with the photos
 * and, optionally, the product category the claim is about.
 * No YouCam call is made here, so this endpoint costs no credits.
 */
export async function POST(req: Request) {
  const rl = limiter("claim-check", PER_MINUTE).take(clientIp(req.headers));
  if (!rl.ok) return tooMany(rl.retryAfter);
  if (!(req.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Content-Type must be application/json." }, { status: 415 });
  }
  let body: unknown;
  try {
    body = JSON.parse((await readBodyLimited(req, MAX_BODY_BYTES)).toString("utf-8"));
  } catch (e) {
    if (e instanceof BodyTooLarge) return NextResponse.json({ error: e.message }, { status: 413 });
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  try {
    const r = parseClaimCheckRequest(body);
    return NextResponse.json(await claimCheck({ before: r.before, after: r.after, beforeImage: r.beforeImage, afterImage: r.afterImage, product: r.product }));
  } catch (e) {
    if (e instanceof RequestError) return NextResponse.json({ error: e.message }, { status: 400 });
    return NextResponse.json({ error: "The photos could not be read. Send JPEG or PNG under 4 MB each." }, { status: 400 });
  }
}
