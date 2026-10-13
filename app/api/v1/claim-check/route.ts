import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { parseScoresInput, toClaimCheckResponse } from "@/lib/brand-api";
import { compareConditions } from "@/lib/conditions";
import { noiseModel } from "@/lib/demo";
import { measure } from "@/lib/measure";
import { evaluate } from "@/lib/noise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function decodeImage(v: unknown, label: string): Buffer {
  if (typeof v !== "string" || !v) throw new Error(`${label}.image_base64 is required`);
  const b = Buffer.from(v.replace(/^data:image\/\w+;base64,/, ""), "base64");
  if (b.length === 0) throw new Error(`${label}.image_base64 is not valid base64`);
  if (b.length > MAX_IMAGE_BYTES) throw new Error(`${label}.image_base64 is larger than 4 MB`);
  return b;
}

/**
 * Brand-facing check. The brand already has YouCam scores for both photos; it sends them with the photos.
 * No YouCam call is made here, so this endpoint costs no credits.
 */
export async function POST(req: Request) {
  let body: Record<string, Record<string, unknown>>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  try {
    const before = parseScoresInput(body?.before?.scores);
    const after = parseScoresInput(body?.after?.scores);
    if (!before || !after) throw new Error("before.scores and after.scores must contain moisture, pore, wrinkle or radiance with ui and raw values");
    const bi = decodeImage(body.before.image_base64, "before");
    const ai = decodeImage(body.after.image_base64, "after");
    const [bs, as] = await Promise.all([measure(bi), measure(ai)]);
    const conditions = compareConditions(bs, as);
    const identical = createHash("sha256").update(bi).digest("hex") === createHash("sha256").update(ai).digest("hex");
    const ev = evaluate({ before, after, conditions, noise: noiseModel, identical });
    return NextResponse.json(toClaimCheckResponse(conditions, ev));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid request" }, { status: 400 });
  }
}
