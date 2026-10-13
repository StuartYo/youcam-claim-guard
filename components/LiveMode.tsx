"use client";

import { useState } from "react";
import noiseJson from "@/data/noise-model.json";
import { AUDIT_EVENT, auditEntry } from "@/lib/audit";
import { CLAIM_POLICY, PRODUCT_CATEGORIES, type ProductCategory } from "@/lib/claim-policy";
import type { ConditionsResult } from "@/lib/conditions";
import { evaluate, fmtSigned, METRIC_LABEL, METRICS, type Evaluation, type NoiseModel, type Scores } from "@/lib/noise";
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
  request_id: string;
  checked_at: string;
  identical: boolean;
  conditions: ConditionsResult;
  evaluation: Evaluation;
  paidAnalyses: number;
  remaining: { global: number; ip: number };
}

/** The server accepts up to 4 MB per photo (lib/server/image.ts). Larger photos are downscaled here first. */
const MAX_BYTES = 4 * 1024 * 1024;
/** Re-encode until a photo is at most this size, so two photos stay well inside common serverless body limits. */
const TARGET_BYTES = 2 * 1024 * 1024;
/** Refuse to decode anything bigger than this in the browser. */
const MAX_PICK_BYTES = 40 * 1024 * 1024;

/** Two demo photos for a free try: ceiling light (before) and desk spot (after). Same face, same day, different room and light. */
const SAMPLE = { before: "/demo/IMG_1373.jpg", after: "/demo/IMG_1406.jpg" } as const;
/** The real YouCam responses for those two photos, saved when they were analyzed. Showing them costs no credits. */
const SAMPLE_CACHED = { before: "/demo/youcam/IMG_1373.json", after: "/demo/youcam/IMG_1406.json" } as const;

interface CachedResponse {
  cached: { photo: string; fetched: string | null; endpoint: string; note: string };
  response: { data: { results: { output: Array<{ type: string; ui_score?: number; raw_score?: number; score?: number }> } } };
}

type Output = CachedResponse["response"]["data"]["results"]["output"];
const scoresOf = (o: Output): Scores =>
  Object.fromEntries(o.filter((x) => (METRICS as readonly string[]).includes(x.type)).map((x) => [x.type, { ui: x.ui_score!, raw: x.raw_score! }]));

const noiseModel = noiseJson.metrics as NoiseModel;

/** Both cached responses in one table: same metric order on both sides, with the change. */
function CachedTable({ before, after }: { before: CachedResponse; after: CachedResponse }) {
  const b = scoresOf(before.response.data.results.output);
  const a = scoresOf(after.response.data.results.output);
  return (
    <div className="cached">
      <p className="cached__title">
        YouCam scores: {before.cached.photo} to {after.cached.photo}
        <span>Cached responses from {after.cached.fetched ?? "an earlier run"}. All four scores are higher-is-better.</span>
      </p>
      <div className="table-scroll">
        <table className="cached__table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>ui before</th>
              <th>ui after</th>
              <th>ui change</th>
              <th>raw before</th>
              <th>raw after</th>
              <th>raw change</th>
            </tr>
          </thead>
          <tbody>
            {METRICS.filter((m) => b[m] && a[m]).map((m) => (
              <tr key={m}>
                <td>{METRIC_LABEL[m]}</td>
                <td className="num">{b[m]!.ui}</td>
                <td className="num">{a[m]!.ui}</td>
                <td className="num">{fmtSigned(a[m]!.ui - b[m]!.ui, 0)}</td>
                <td className="num">{b[m]!.raw.toFixed(2)}</td>
                <td className="num">{a[m]!.raw.toFixed(2)}</td>
                <td className="num">{fmtSigned(a[m]!.raw - b[m]!.raw, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(
        [
          ["Before", before],
          ["After", after],
        ] as const
      ).map(([label, c]) => (
        <details key={label} className="cached__raw">
          <summary>
            {label} response JSON ({c.cached.photo})
          </summary>
          <pre className="json-box">
            <code>{JSON.stringify(c.response, null, 1)}</code>
          </pre>
        </details>
      ))}
    </div>
  );
}

function emitAudit(id: string, time: string, source: "live upload" | "sample photos", conditions: ConditionsResult, ev: Evaluation) {
  window.dispatchEvent(new CustomEvent(AUDIT_EVENT, { detail: auditEntry(id, time, source, conditions, ev) }));
}

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

/** Downscale in the browser so each upload stays under the server limit. The server validates again. */
async function shrink(file: File): Promise<Blob> {
  if (!/^image\/(jpeg|png)$/.test(file.type)) throw new Error(`${file.name} is not a JPG or PNG.`);
  if (file.size > MAX_PICK_BYTES) throw new Error(`${file.name} is ${(file.size / 1048576).toFixed(1)} MB, too large to downscale here. Export a smaller copy.`);
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const s = Math.min(1, LONG_SIDE / Math.max(bmp.width, bmp.height));
  if (s === 1 && file.type === "image/jpeg" && file.size <= TARGET_BYTES) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * s);
  canvas.height = Math.round(bmp.height * s);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const encode = (q: number) =>
    new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not encode the photo."))), "image/jpeg", q));
  for (const q of [0.92, 0.85, 0.75, 0.65]) {
    const b = await encode(q);
    if (b.size <= TARGET_BYTES) return b;
  }
  const last = await encode(0.6);
  if (last.size > MAX_BYTES) throw new Error(`${file.name} is still over 4 MB after downscaling.`);
  return last;
}

export function LiveMode() {
  const [files, setFiles] = useState<Partial<Record<Side, Picked>>>({});
  const [blobs, setBlobs] = useState<Partial<Record<Side, Blob>>>({});
  const [consent, setConsent] = useState(false);
  const [product, setProduct] = useState<ProductCategory | "">("");
  const [busy, setBusy] = useState<"" | "check" | "analyze">("");
  const [error, setError] = useState<{ text: string; limit?: boolean } | null>(null);
  const [check, setCheck] = useState<ConditionsResponse | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [sample, setSample] = useState(false);
  const [cached, setCached] = useState<{ before: CachedResponse; after: CachedResponse } | null>(null);

  async function pick(side: Side, file: File | undefined) {
    setError(null);
    setCheck(null);
    setResult(null);
    setSample(false);
    setCached(null);
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

  function form(paid = false, confirm = false, use: Partial<Record<Side, Blob>> = blobs) {
    const fd = new FormData();
    fd.append("before", use.before!, "before.jpg");
    fd.append("after", use.after!, "after.jpg");
    if (paid) {
      // The server refuses the paid call without this flag, whatever the browser does.
      if (consent) fd.append("consent", "1");
      if (product) fd.append("product_category", product);
      if (confirm) fd.append("confirm", "1");
    }
    return fd;
  }

  function clearAll() {
    setFiles((f) => {
      for (const side of ["before", "after"] as const) if (f[side]) URL.revokeObjectURL(f[side]!.url);
      return {};
    });
    setBlobs({});
    setCheck(null);
    setResult(null);
    setSample(false);
    setCached(null);
    setError(null);
  }

  async function loadSample() {
    setBusy("check");
    setError(null);
    setCheck(null);
    setResult(null);
    setSample(true);
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
      const [cb, ca] = await Promise.all(
        (["before", "after"] as const).map(async (side) => {
          const r = await fetch(SAMPLE_CACHED[side]);
          if (!r.ok) throw new Error("Could not load the cached YouCam responses.");
          return (await r.json()) as CachedResponse;
        }),
      );
      setCached({ before: cb, after: ca });
      const checked = await runCheck(nextBlobs);
      if (checked) {
        const ev = evaluate({
          before: scoresOf(cb.response.data.results.output),
          after: scoresOf(ca.response.data.results.output),
          conditions: checked.conditions,
          noise: noiseModel,
          identical: checked.identical,
        });
        emitAudit(`sample-${cb.cached.photo}-${ca.cached.photo}`, new Date().toISOString(), "sample photos", checked.conditions, ev);
      } else setSample(false);
    } catch (e) {
      setError({ text: e instanceof Error ? e.message : "Could not load the sample photos." });
      setSample(false);
      setBusy("");
    }
  }

  async function runCheck(use: Partial<Record<Side, Blob>> = blobs): Promise<ConditionsResponse | null> {
    setBusy("check");
    setError(null);
    setResult(null);
    try {
      const r = await fetch("/api/conditions", { method: "POST", body: form(false, false, use) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "The check failed.");
      setCheck(j);
      return j as ConditionsResponse;
    } catch (e) {
      setError({ text: e instanceof Error ? e.message : "The check failed." });
      return null;
    } finally {
      setBusy("");
    }
  }

  async function runAnalyze() {
    if (!check) return;
    setBusy("analyze");
    setError(null);
    try {
      const r = await fetch("/api/analyze", { method: "POST", body: form(true, !check.conditions.match) });
      const j = await r.json();
      if (!r.ok) {
        setError({ text: j.error ?? "Analysis failed.", limit: Boolean(j.limit) });
        return;
      }
      const res = j as AnalyzeResponse;
      setResult(res);
      emitAudit(res.request_id, res.checked_at, "live upload", res.conditions, res.evaluation);
    } catch {
      setError({ text: "Analysis failed. Check your connection and try again." });
    } finally {
      setBusy("");
    }
  }

  const ready = Boolean(blobs.before && blobs.after);
  const needed = check?.live.analysesNeeded ?? 2;
  const sampleDone = sample && check !== null;

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
          <p className="hint">JPG or PNG, up to 4 MB per photo. Larger photos are downscaled in your browser before upload.</p>
          <label className="product-pick">
            <span>Product the claim is about</span>
            <select value={product} onChange={(e) => setProduct(e.target.value as ProductCategory | "")}>
              <option value="">Not specified (claim-type check skipped)</option>
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CLAIM_POLICY[c].label}
                  {CLAIM_POLICY[c].makeup ? " (makeup)" : ""}
                </option>
              ))}
            </select>
          </label>
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
            {sampleDone ? (
              <button type="button" className="btn btn--done" onClick={clearAll}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
                Sample checked. Clear
              </button>
            ) : (
              <button type="button" className="btn btn--soft" disabled={busy !== ""} onClick={loadSample}>
                {sample && busy === "check" ? "Loading sample..." : "Try with sample photos"}
              </button>
            )}
            <span>
              {sampleDone
                ? "Results are below. Clear to start over with your own photos."
                : "Loads two demo photos (ceiling light, then desk spot), runs the free check and shows their cached YouCam responses. No credits used."}
            </span>
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
                  ? "Any score change between these two photos would be blocked."
                  : "Any score change here will be blocked. You can still run the analysis to see what the API reports."}
            </span>
          </p>
          <ConditionsList conditions={check.conditions} />

          {sample ? (
            <>
              {cached && <CachedTable before={cached.before} after={cached.after} />}
              <p className="note">
                These are the real YouCam skin analysis responses for these two photos, saved when they were analyzed, so no credits are used here.
                The full verdict is in the <a href="#cases">ceiling light to desk spot case</a>, and this check was added to the{" "}
                <a href="#audit">audit log</a>.
              </p>
            </>
          ) : (
            <>
              <div className="consent">
                <label>
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  <span>
                    Send both photos to YouCam (Perfect Corp.) for skin analysis. YouCam keeps results for 24 hours. This app stores nothing except
                    a SHA-256 hash of each photo with its scores, kept in memory for up to 24 hours so the same photo is not analyzed twice.
                  </span>
                </label>
              </div>

              {!check.live.configured ? (
                <p className="note">Live analysis is not available on this server right now. The cases above use real results.</p>
              ) : (
                <div className="step">
                  <button className="btn btn--primary" disabled={!consent || busy !== ""} onClick={runAnalyze}>
                    {busy === "analyze" ? "Analyzing (about 20 seconds)..." : check.conditions.match ? `Run skin analysis` : `Analyze anyway`}
                  </button>
                  <span className="step__note">
                    {needed === 0 ? "Both photos are cached, so this is free." : `Uses ${needed} of today's live analyses.`} Left today:{" "}
                    {check.live.remaining.ip} for you, {check.live.remaining.global} in total.
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
            {result.paidAnalyses === 0 ? "Served from cache, no new analyses used." : `${result.paidAnalyses} new analyses used.`} Left today:{" "}
            {result.remaining.ip} for you. Added to the <a href="#audit">audit log</a>.
          </p>
          <ResultPanel
            before={{ image: files.before.url, caption: files.before.file.name }}
            after={{ image: files.after.url, caption: files.after.file.name }}
            conditions={result.conditions}
            evaluation={result.evaluation}
          />
        </div>
      )}
    </div>
  );
}
