import { NextResponse } from "next/server";
import { compareConditions } from "@/lib/conditions";
import { measure } from "@/lib/measure";
import { creditGuard, sha256 } from "@/lib/server/guard";
import { clientIp, InputError, prepareImage } from "@/lib/server/image";
import { getApiKey } from "@/lib/server/key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Free step: compare capture conditions of two photos. Nothing is sent to YouCam. */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const [b, a] = await Promise.all([
      prepareImage(form.get("before") as File | null, "before"),
      prepareImage(form.get("after") as File | null, "after"),
    ]);
    const [bs, as] = await Promise.all([measure(b.jpeg), measure(a.jpeg)]);
    const guard = creditGuard();
    const hb = sha256(b.original);
    const ha = sha256(a.original);
    const cost = (guard.getCached(hb) ? 0 : 1) + (ha === hb || guard.getCached(ha) ? 0 : 1);
    return NextResponse.json({
      identical: hb === ha,
      before: { capture: bs, width: b.width, height: b.height },
      after: { capture: as, width: a.width, height: a.height },
      conditions: compareConditions(bs, as),
      live: { configured: Boolean(getApiKey()), analysesNeeded: cost, remaining: guard.remaining(clientIp(req.headers)) },
    });
  } catch (e) {
    if (e instanceof InputError) return NextResponse.json({ error: e.message }, { status: 400 });
    return NextResponse.json({ error: "The photos could not be processed. Use a JPG or PNG under 10 MB." }, { status: 400 });
  }
}
