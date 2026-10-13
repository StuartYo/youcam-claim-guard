"use client";

import { useState } from "react";
import type { ConditionsResult } from "@/lib/conditions";
import type { Evaluation } from "@/lib/noise";
import { ConditionsList, ResultPanel } from "./ResultPanel";

type Side = "before" | "after";
interface Picked {
  file: File;
  url: string;
}
interface ConditionsResponse {
  identical: boolean;
  conditions: ConditionsResult;
  live: { configured: boolean; analysesNeeded: number; remaining: { global: number; ip: number } };
}
interface AnalyzeResponse {
  identical: boolean;
  conditions: ConditionsResult;
  evaluation: Evaluation;
  paidAnalyses: number;
  remaining: { global: number; ip: number };
}

const MAX_BYTES = 10 * 1024 * 1024;
const LONG_SIDE = 2560;

/** Downscale in the browser so the upload stays small. The server validates again. */
async function shrink(file: File): Promise<Blob> {
  if (!/^image\/(jpeg|png)$/.test(file.type)) throw new Error(`${file.name} is not a JPG or PNG.`);
  if (file.size > MAX_BYTES) throw new Error(`${file.name} is ${(file.size / 1048576).toFixed(1)} MB. The limit is 10 MB.`);
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const s = Math.min(1, LONG_SIDE / Math.max(bmp.width, bmp.height));
  if (s === 1 && file.type === "image/jpeg" && file.size < 3.5 * 1048576) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * s);
  canvas.height = Math.round(bmp.height * s);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not encode the photo."))), "image/jpeg", 0.92));
}

export function LiveMode() {
  const [files, setFiles] = useState<Partial<Record<Side, Picked>>>({});
  const [blobs, setBlobs] = useState<Partial<Record<Side, Blob>>>({});
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<"" | "check" | "analyze">("");
  const [error, setError] = useState<{ text: string; limit?: boolean } | null>(null);
  const [check, setCheck] = useState<ConditionsResponse | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  async function pick(side: Side, file: File | undefined) {
    setError(null);
    setCheck(null);
    setResult(null);
    if (!file) return;
    try {
      const blob = await shrink(file);
      setFiles((f) => {
        if (f[side]) URL.revokeObjectURL(f[side]!.url);
        return { ...f, [side]: { file, url: URL.createObjectURL(file) } };
      });
      setBlobs((b) => ({ ...b, [side]: blob }));
    } catch (e) {
      setError({ text: e instanceof Error ? e.message : "Could not read the photo." });
    }
  }

  function form(confirm = false) {
    const fd = new FormData();
    fd.append("before", blobs.before!, "before.jpg");
    fd.append("after", blobs.after!, "after.jpg");
    if (confirm) fd.append("confirm", "1");
    return fd;
  }

  async function runCheck() {
    setBusy("check");
    setError(null);
    setResult(null);
    try {
      const r = await fetch("/api/conditions", { method: "POST", body: form() });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "The check failed.");
      setCheck(j);
    } catch (e) {
      setError({ text: e instanceof Error ? e.message : "The check failed." });
    } finally {
      setBusy("");
    }
  }

  async function runAnalyze() {
    if (!check) return;
    setBusy("analyze");
    setError(null);
    try {
      const r = await fetch("/api/analyze", { method: "POST", body: form(!check.conditions.match) });
      const j = await r.json();
      if (!r.ok) {
        setError({ text: j.error ?? "Analysis failed.", limit: Boolean(j.limit) });
        return;
      }
      setResult(j);
    } catch {
      setError({ text: "Analysis failed. Check your connection and try again." });
    } finally {
      setBusy("");
    }
  }

  const ready = Boolean(blobs.before && blobs.after);
  const needed = check?.live.analysesNeeded ?? 2;

  return (
    <div className="live">
      <div className="live__inputs">
        {(["before", "after"] as const).map((side) => (
          <label key={side} className={`drop ${files[side] ? "has-file" : ""}`}>
            <input type="file" accept="image/jpeg,image/png" onChange={(e) => pick(side, e.target.files?.[0])} />
            {files[side] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={files[side]!.url} alt={`${side} photo preview`} />
            ) : (
              <span className="drop__empty">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" />
                </svg>
                Choose {side} photo
              </span>
            )}
            <span className="drop__label">{side === "before" ? "Before" : "After"}</span>
          </label>
        ))}
      </div>
      <p className="hint">JPG or PNG, under 10 MB. Frontal face, forehead visible, no glasses. Take both photos in the same spot under the same light.</p>

      <div className="step">
        <button className="btn" disabled={!ready || busy !== ""} onClick={runCheck}>
          {busy === "check" ? "Checking conditions..." : "Check capture conditions"}
        </button>
        <span className="step__note">Free. Runs on this server; nothing goes to YouCam.</span>
      </div>

      {check && (
        <div className={`live__check ${check.conditions.match ? "is-ok" : "is-blocked"}`}>
          <p className="verdict-line">
            {check.identical ? "Both photos are the same file." : check.conditions.match ? "Conditions match." : "Conditions differ."}
            <span>
              {check.conditions.match
                ? "Score changes between these photos can be compared."
                : "Any score change here will be blocked. You can still run the analysis to see what the API reports."}
            </span>
          </p>
          <ConditionsList conditions={check.conditions} />

          <div className="consent">
            <label>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                Send both photos to YouCam (Perfect Corp.) for skin analysis. YouCam keeps results for 24 hours. This app stores nothing except a
                SHA-256 hash of each photo with its scores, kept in memory for up to 24 hours so the same photo is not analyzed twice.
              </span>
            </label>
          </div>

          {!check.live.configured ? (
            <p className="note">Live analysis is not configured on this server. The cases above use real results.</p>
          ) : (
            <div className="step">
              <button className="btn btn--primary" disabled={!consent || busy !== ""} onClick={runAnalyze}>
                {busy === "analyze"
                  ? "Analyzing (about 20 seconds)..."
                  : check.conditions.match
                    ? `Run skin analysis`
                    : `Analyze anyway`}
              </button>
              <span className="step__note">
                {needed === 0 ? "Both photos are cached, so this is free." : `Uses ${needed} of today's live analyses.`} Left today: {check.live.remaining.ip} for you,{" "}
                {check.live.remaining.global} in total.
              </span>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="error" role="alert">
          {error.text}
          {error.limit && (
            <>
              {" "}
              <a href="#cases">Open the demo cases</a>
            </>
          )}
        </p>
      )}

      {result && files.before && files.after && (
        <div className="live__result">
          <p className="note">
            {result.paidAnalyses === 0 ? "Served from cache, no new analyses used." : `${result.paidAnalyses} new analyses used.`} Left today: {result.remaining.ip} for you.
          </p>
          <ResultPanel
            before={{ image: files.before.url, caption: files.before.file.name }}
            after={{ image: files.after.url, caption: files.after.file.name }}
            conditions={result.conditions}
            evaluation={result.evaluation}
            demo={false}
          />
        </div>
      )}
    </div>
  );
}
