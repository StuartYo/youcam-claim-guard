import { CaseExplorer } from "@/components/CaseExplorer";
import { LiveMode } from "@/components/LiveMode";
import { NoiseRuler } from "@/components/NoiseRuler";
import { toClaimCheckResponse } from "@/lib/brand-api";
import { calibrationTable } from "@/lib/calibration";
import { compareConditions } from "@/lib/conditions";
import { demoCases, demoData, isPlaceholder, noiseModel, photo } from "@/lib/demo";
import { badgeText, METRIC_LABEL, METRICS } from "@/lib/noise";

export default function Home() {
  const lamp = demoCases.find((c) => c.slug === "lamp-window");
  if (!lamp || isPlaceholder(lamp)) throw new Error("lamp-window case missing");
  const lampMoisture = lamp.evaluation.metrics.find((m) => m.metric === "moisture")!;
  const s1 = demoData.photos.filter((p) => p.session === "s1");
  const avg = (s: string) => {
    const xs = demoData.photos.filter((p) => p.session === s).map((p) => p.scores.moisture!.ui);
    return (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1);
  };
  const calib = calibrationTable(demoData.photos);
  let samePass = 0, sameTotal = 0, crossFail = 0, crossTotal = 0;
  for (const p of demoData.photos)
    for (const q of demoData.photos) {
      if (p === q) continue;
      const ok = compareConditions(p.capture, q.capture).match;
      if (p.session === "s1" && q.session === "s1") { sameTotal++; if (ok) samePass++; }
      else if (p.session !== q.session) { crossTotal++; if (!ok) crossFail++; }
    }

  const b = photo(lamp.before.id);
  const a = photo(lamp.after.id);
  const toEntries = (s: typeof b.scores) => METRICS.map((m) => ({ type: m, ui_score: s[m]!.ui, raw_score: s[m]!.raw }));
  const request = {
    before: { scores: toEntries(b.scores), image_base64: "<JPEG as base64>" },
    after: { scores: toEntries(a.scores), image_base64: "<JPEG as base64>" },
  };
  const response = toClaimCheckResponse(lamp.conditions, lamp.evaluation);

  return (
    <>
      <header className="top">
        <div className="wrap top__inner">
          <a className="wordmark" href="#">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="2" y="9" width="20" height="6" rx="1" className="wordmark__band" />
              <path d="M2 12h20M12 5v14" />
            </svg>
            Claim Guard
          </a>
          <nav aria-label="Sections">
            <a href="#cases">Cases</a>
            <a href="#how">How it decides</a>
            <a href="#live">Try your own photos</a>
            <a href="#brands">For brands</a>
          </nav>
        </div>
      </header>

      <main>
        <section className="hero wrap">
          <div className="hero__text">
            <p className="kicker">QA for skin-analysis claims</p>
            <h1>Check a skin-score badge before your app shows it</h1>
            <p className="lede">
              Claim Guard sits between YouCam skin analysis and the badge your app displays. It checks whether a before/after change is larger
              than retake noise, and whether both photos were taken under comparable light. If either check fails, the badge is held back with the
              reason.
            </p>
            <p className="fact">
              We took 15 selfies of one face on one day, with no skincare in between. Moving from a ceiling light to a window raised the average
              moisture score from {avg("s3")} to {avg("s2")}.
            </p>
            <div className="hero__links">
              <a className="btn btn--primary" href="#cases">
                See the cases
              </a>
              <a className="btn" href="#brands">
                API for brands
              </a>
            </div>
          </div>

          <figure className="specimen" aria-label="Example: a moisture badge blocked by Claim Guard">
            <div className="specimen__photos">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={lamp.before.image} alt="Before: ceiling light" width={540} height={720} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={lamp.after.image} alt="After: window behind" width={540} height={720} />
              <span className="specimen__cap specimen__cap--l">Ceiling light</span>
              <span className="specimen__cap specimen__cap--r">Window</span>
            </div>
            <div className="specimen__body">
              <div className="specimen__row">
                <span className="badge badge--struck badge--lg">{badgeText("moisture", lampMoisture.deltaUiPct)}</span>
                <span className="tag tag--blocked-conditions">Blocked</span>
              </div>
              <p className="specimen__reason">The light changed between photos. Same face, same day, no product.</p>
              <NoiseRuler deltaRaw={lampMoisture.deltaRaw} mdc={lampMoisture.mdc95} verdict="blocked-conditions" />
              <p className="specimen__legend">Hatched band: how far moisture moves between retakes under the same light.</p>
            </div>
            <figcaption className="demo-tag">Demo data: developer&apos;s own photos</figcaption>
          </figure>
        </section>

        <section id="cases" className="section wrap">
          <div className="section__head">
            <h2>Cases</h2>
            <p>
              Real YouCam SD skin analysis results from the photos above. Pick a case to see what the app would display and what Claim Guard
              decides.
            </p>
          </div>
          <CaseExplorer cases={demoCases} />
        </section>

        <section id="how" className="section wrap">
          <div className="section__head">
            <h2>How it decides</h2>
            <p>Three checks, in this order. The first one that applies sets the verdict.</p>
          </div>
          <ol className="order">
            <li>
              <strong>Same file.</strong> If both photos have the same SHA-256, nothing changed. Sending the same file twice returned identical
              scores, so the API adds no jitter of its own.
            </li>
            <li>
              <strong>Capture conditions.</strong> Four measurements on the photos themselves. If any is outside its limit, every metric is
              blocked: the scores were taken under different light and can&apos;t be compared.
            </li>
            <li>
              <strong>Noise floor.</strong> A metric is claimable only if its raw score moved more than the minimum detectable change (MDC95).
              Otherwise the change could come from retaking the photo.
            </li>
          </ol>

          <div className="how-grid">
            <div className="how-card">
              <h3>Noise floor</h3>
              <p>
                From {s1.length} selfies at the same spot under the same light. The test uses{" "}
                <code>raw_score</code> because <code>ui_score</code> is a compressed display scale: same-light retakes move ui by about 1 point,
                while raw shows the spread.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Shots</th>
                      <th>SD (raw)</th>
                      <th>MDC95 (raw)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {METRICS.map((m) => (
                      <tr key={m}>
                        <td>{METRIC_LABEL[m]}</td>
                        <td className="num">{noiseModel[m].n}</td>
                        <td className="num">{noiseModel[m].sd.toFixed(2)}</td>
                        <td className="num">±{noiseModel[m].mdc95.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="formula">
                MDC95 = 1.96 &times; &radic;2 &times; SD
              </p>
              <p className="small">
                Each photo carries its own retake error, so the difference of two photos has an SD of &radic;2 &times; SD. A change outside 1.96 of
                those SDs happens by chance less than 5% of the time.
              </p>
            </div>

            <div className="how-card">
              <h3>Capture conditions</h3>
              <p>
                Measured on the photos with no face detection: a central face box and the background strips beside the head. Limits sit between
                what same-light retakes produced and what a lamp change produced.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Check</th>
                      <th>Limit</th>
                      <th>Same light, max</th>
                      <th>Light changed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calib.map((r) => (
                      <tr key={r.id}>
                        <td>
                          {r.label}
                          <span className="td-sub">{r.measures}</span>
                        </td>
                        <td className="num">{r.limit}</td>
                        <td className="num">{r.sameLight}</td>
                        <td className="num">{r.lightChange}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="small">
                No single check catches every lamp change. Together they blocked {crossFail} of {crossTotal} photo pairs taken under different light and passed {samePass} of {sameTotal} same-light pairs.
                Run <code>npm run calibrate</code> for the full printout.
              </p>
            </div>
          </div>
          <p className="caveat">
            These limits come from one face, one phone and three lighting setups. A brand would recalibrate with retakes from its own users and
            devices before relying on them.
          </p>
        </section>

        <section id="live" className="section wrap">
          <div className="section__head">
            <h2>Try your own photos</h2>
            <p>
              Upload a before and an after photo. The capture check runs first and costs nothing. Skin analysis runs only after you agree, and it
              uses real YouCam credits, so there is a daily limit.
            </p>
          </div>
          <LiveMode />
        </section>

        <section id="brands" className="section wrap">
          <div className="section__head">
            <h2>For brands</h2>
            <p>
              Your app already gets scores from YouCam. Before showing a badge, send those scores and the two photos to Claim Guard. It makes no
              YouCam call of its own, so the check costs no credits.
            </p>
          </div>
          <ol className="order order--compact">
            <li>Run YouCam skin analysis on the before and after photos, as you do now.</li>
            <li>
              <code>POST /api/v1/claim-check</code> with both sets of scores and both photos.
            </li>
            <li>
              Show a badge only for metrics where <code>badge</code> is not null. Otherwise log <code>reason</code>, or ask the user to retake
              under the same light.
            </li>
          </ol>
          <div className="code-grid">
            <div className="code">
              <p className="code__title">Request</p>
              <pre>
                <code>{`POST /api/v1/claim-check\nContent-Type: application/json\n\n${JSON.stringify(request, null, 2)}`}</code>
              </pre>
            </div>
            <div className="code">
              <p className="code__title">Response (the &ldquo;ceiling light to window&rdquo; case)</p>
              <pre>
                <code>{JSON.stringify(response, null, 2)}</code>
              </pre>
            </div>
          </div>
          <p className="small">
            Accepts YouCam&apos;s <code>output</code> entries as returned, or a <code>{`{ "moisture": { "ui": 74, "raw": 59.9 } }`}</code> map. Photos up
            to 4 MB each.
          </p>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap foot__inner">
          <p className="demo-tag">Demo data: developer&apos;s own photos, used with his consent.</p>
          <p>
            Scores come from the YouCam skin analysis API (Perfect Corp.). Claim Guard is an independent hackathon project and is not affiliated
            with Perfect Corp. MIT licensed.
          </p>
        </div>
      </footer>
    </>
  );
}
