import "server-only";
import { execFileSync } from "node:child_process";

let cached: string | null | undefined;

/**
 * YouCam API key. Production reads process.env.YOUCAM_API_KEY only.
 * In local development on Windows, a process started before the variable was set won't see it,
 * so we fall back to reading HKCU\Environment. The value is never logged or returned to the client.
 */
export function getApiKey(): string | null {
  if (cached !== undefined) return cached;
  let k = process.env.YOUCAM_API_KEY?.trim() || null;
  if (!k && process.env.NODE_ENV !== "production" && process.platform === "win32") {
    try {
      const out = execFileSync("reg", ["query", "HKCU\\Environment", "/v", "YOUCAM_API_KEY"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      });
      const m = out.match(/YOUCAM_API_KEY\s+REG_(?:EXPAND_)?SZ\s+(\S+)/);
      k = m ? m[1].trim() : null;
    } catch {
      k = null;
    }
  }
  cached = k;
  return k;
}
