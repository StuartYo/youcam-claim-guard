/**
 * Request protection for every route that decodes images: per-IP rate limit and a hard body-size cap.
 * In memory per server instance, like the credit guard. On serverless hosts each instance counts on its own.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private max: number,
    private windowMs: number,
    private now: () => number = Date.now,
  ) {}

  /** Records a hit and returns whether it is allowed, plus seconds until the oldest hit leaves the window. */
  take(key: string): { ok: true } | { ok: false; retryAfter: number } {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return { ok: false, retryAfter: Math.max(1, Math.ceil((recent[0] + this.windowMs - t) / 1000)) };
    }
    recent.push(t);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) {
      for (const [k, v] of this.hits) if (!v.length || t - v[v.length - 1] >= this.windowMs) this.hits.delete(k);
    }
    return { ok: true };
  }
}

const g = globalThis as unknown as { __claimGuardLimiters?: Map<string, RateLimiter> };

/** One limiter per route name, shared across requests in this instance. */
export function limiter(route: string, max: number, windowMs = 60_000): RateLimiter {
  g.__claimGuardLimiters ??= new Map();
  let l = g.__claimGuardLimiters.get(route);
  if (!l) {
    l = new RateLimiter(max, windowMs);
    g.__claimGuardLimiters.set(route, l);
  }
  return l;
}

export class BodyTooLarge extends Error {
  constructor(public limit: number) {
    super(`Request body is larger than ${Math.round(limit / 1048576)} MB.`);
  }
}

/** Reads the body, refusing early on Content-Length and again while streaming, so a missing or false header can't get around the cap. */
export async function readBodyLimited(req: Request, limit: number): Promise<Buffer> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > limit) throw new BodyTooLarge(limit);
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new BodyTooLarge(limit);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Parses multipart form data from a size-limited body. */
export async function formDataLimited(req: Request, limit: number): Promise<FormData> {
  const buf = await readBodyLimited(req, limit);
  return new Response(new Uint8Array(buf), { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData();
}

export function tooMany(retryAfter: number) {
  return Response.json(
    { error: `Too many requests from this address. Try again in ${retryAfter} s.` },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
