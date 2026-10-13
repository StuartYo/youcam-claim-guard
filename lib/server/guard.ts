import { createHash } from "node:crypto";
import type { AnalysisResult } from "./youcam";

/**
 * Credit protection for live mode.
 * - Results are cached by SHA-256 of the image bytes, so the same photo is never paid for twice.
 * - A global daily cap and a per-IP daily cap count paid analyses only (cache hits are free).
 * State is in memory per server instance. On serverless hosts each instance has its own counters,
 * which makes the caps an upper bound per instance; see README.
 */
export const sha256 = (b: Buffer | Uint8Array) => createHash("sha256").update(b).digest("hex");

export interface Limits {
  daily: number;
  perIp: number;
}

export function readLimits(env: Record<string, string | undefined> = process.env): Limits {
  const n = (v: string | undefined, d: number) => {
    const x = Number.parseInt(v ?? "", 10);
    return Number.isFinite(x) && x >= 0 ? x : d;
  };
  return { daily: n(env.DAILY_LIVE_LIMIT, 20), perIp: n(env.PER_IP_LIVE_LIMIT, 4) };
}

/**
 * LIVE_ANALYSIS_ENABLED switches paid analysis on or off without a redeploy of code. Default on; "false", "0" or "off"
 * turn it off. The daily caps still apply when it is on.
 */
export function liveEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.LIVE_ANALYSIS_ENABLED ?? "").trim().toLowerCase();
  return !["false", "0", "off", "no"].includes(v);
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;

export class CreditGuard {
  private day = "";
  private used = 0;
  private perIp = new Map<string, number>();
  private cache = new Map<string, { at: number; result: AnalysisResult }>();

  constructor(private limits: Limits, private now: () => number = Date.now) {}

  private roll() {
    const d = new Date(this.now()).toISOString().slice(0, 10);
    if (d !== this.day) {
      this.day = d;
      this.used = 0;
      this.perIp.clear();
    }
  }

  getCached(hash: string): AnalysisResult | null {
    const hit = this.cache.get(hash);
    if (!hit) return null;
    if (this.now() - hit.at > CACHE_TTL_MS) {
      this.cache.delete(hash);
      return null;
    }
    return hit.result;
  }

  setCached(hash: string, result: AnalysisResult) {
    if (this.cache.size >= CACHE_MAX) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(hash, { at: this.now(), result });
  }

  /** Can this IP pay for `count` more analyses today? Returns a readable reason when not. */
  check(ip: string, count: number): { ok: true } | { ok: false; reason: string } {
    this.roll();
    if (count === 0) return { ok: true };
    if (this.used + count > this.limits.daily) {
      return { ok: false, reason: `The live demo has used its daily limit of ${this.limits.daily} analyses. It resets at 00:00 UTC. The demo cases above use real results and cost nothing.` };
    }
    const mine = this.perIp.get(ip) ?? 0;
    if (mine + count > this.limits.perIp) {
      return { ok: false, reason: `You have used your ${this.limits.perIp} live analyses for today. The demo cases above use real results and cost nothing.` };
    }
    return { ok: true };
  }

  /** Record one paid analysis. Called before the API request so concurrent requests cannot overshoot. */
  record(ip: string) {
    this.roll();
    this.used++;
    this.perIp.set(ip, (this.perIp.get(ip) ?? 0) + 1);
  }

  remaining(ip: string) {
    this.roll();
    return {
      global: Math.max(0, this.limits.daily - this.used),
      ip: Math.max(0, this.limits.perIp - (this.perIp.get(ip) ?? 0)),
    };
  }
}

const g = globalThis as unknown as { __claimGuard?: CreditGuard };
export function creditGuard(): CreditGuard {
  if (!g.__claimGuard) g.__claimGuard = new CreditGuard(readLimits());
  return g.__claimGuard;
}
