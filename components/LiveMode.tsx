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

/** Two demo photos for a free try: ceiling light (before) and desk spot (after). Same face, same day, different light. */
const SAMPLE = { before: "/demo/IMG_1373.jpg", after: "/demo/IMG_1406.jpg" } as const;

const GUIDE = [
  {
    title: "Same spot",
    text: "Stand where you stood for the before photo.",
    icon: <path d="M12 21s-6-5.6-6-10.5A6 6 0 0118 10.5C18 15.4 12 21 12 21zM12 12.5a2 2 0 100-4 2 2 0 000 4z" />,
  },
  {
    title: "Same light",
    text: "Same lamp, same time of day. Daylight changes by the hour.",
    icon: <path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z" />,
  },
  {
    title: "Forehead visible",
    text: "Face the camera, hair back, no glasses.",
    icon: <path d="M12 3c-3.9 0-6.5 3-6.5 7.2 0 4.6 2.9 9.8 6.5 9.8s6.5-5.2 6.5-9.8C18.5 6 15.9 3 12 3zM9.5 11.5h.01M14.5 11.5h.01M10 15.5c1.2.8 2.8.8 4 0" />,
  },
  {
    title: "No backlight",
    text: "Keep windows and lamps in front of you, not behind.",
    icon: <path d="M4 4h16v16H4zM12 4v16M4 12h16M3 21L21 3" />,
  },
];
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
  const [sample, setSample] = useState(false);

  async function pick(side: Side, file: File | undefined) {
    setError(null);
    setCheck(null);
    setResult(null);
    setSample(false);
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

  function form(confirm = false, use: Partial<Record<Side, Blob>> = blobs) {
    const fd = new FormData();
    fd.append("before", use.before!, "before.jpg");
    fd.append("after", use.after!, "after.jpg");
    if (confirm) fd.append("confirm", "1");
    return fd;
  }

  async function loadSample() {
    setBusy("check");
    setError(null);
    setCheck(null);
    setResult(null);
    try {
      const got = await Promise.all(
        (["before", "after"] as const).map(async (side) => {
          const r = await fetch(SAMPLE[side]);
          if (!r.ok) throw new Error("Could not load the sample photos.");
          const blob = await r.blob();
          return [side, new File([blob], SAMPLE[side].split("/").pop()!, { type: "image/jpeg" })] as const;
        }),
      );
      const nextFiles: Partial<Record<Side, Picked>> = {};
      const nextBlobs: Partial<Record<Side, Blob>> = {};
      for (const [side, file] of got) {
        nextFiles[side] = { file, url: URL.createObjectURL(file) };
        nextBlobs[side] = file;
      }
      setFiles((f) => {
        for (const side of ["before", "after"] as const) if (f[side]) URL.revokeObjectURL(f[side]!.url);
        return nextFiles;
      });
      setBlobs(nextBlobs);
      setSample(true);
      await runCheck(nextBlobs);
    } catch (e) {
      setError({ text: e instanceof Error ? e.message : "Could not load the sample photos." });
      setBusy("");
    }
  }

  async function runCheck(use: Partial<Record<Side, Blob>> = blobs) {
    setBusy("check");
    setError(null);
    setResult(null);
    try {
      const r = await fetch("/api/conditions", { method: "POST", body: form(false, use) });
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
      <div className="live__top">
      <div>
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
      <p className="hint">JPG or PNG, under 10 MB.</p>
      </div>
      <aside className="guide" aria-label="How to take the photos">
        <p className="guide__title">For a fair comparison</p>
        <ul>
          {GUIDE.map((g) => (
            <li key={g.title}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {g.icon}
              </svg>
              <span>
                <strong>{g.title}</strong>
                {g.text}
              </span>
            </li>
          ))}
        </ul>
        <div className="guide__sample">
          <button type="button" className="btn btn--soft" disabled={busy !== ""} onClick={loadSample}>
            Try with sample photos
          </button>
          <span>Loads two demo photos (ceiling light, then desk spot) and runs the free check. No credits used.</span>
        </div>
      </aside>
      </div>

      <div className="step">
        <button className="btn" disabled={!ready || busy !== ""} onClick={() => runCheck()}>
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
                : sample
                  ? "Any score change between these two photos would be held back."
                  : "Any score change here will be blocked. You can still run the analysis to see what the API reports."}
            </span>
          </p>
          <ConditionsList conditions={check.conditions} />

          {sample ? (
            <p className="note">
              These are demo photos, so skin analysis is not offered here. Their real YouCam results are in the{" "}
              <a href="#cases">ceiling light to desk spot case</a>.
            </p>
          ) : (
          <>
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
          </>
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
