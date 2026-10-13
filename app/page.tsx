import { CaseExplorer } from "@/components/CaseExplorer";
import { LiveMode } from "@/components/LiveMode";
import { NoiseRuler } from "@/components/NoiseRuler";
import { PhoneMockup, type PhoneScreen } from "@/components/PhoneMockup";
import { SiteNav } from "@/components/SiteNav";
import { toClaimCheckResponse } from "@/lib/brand-api";
import { calibrationTable } from "@/lib/calibration";
import { demoCases, demoData, noiseModel, photo, type DemoCase } from "@/lib/demo";
import { badgeText, METRIC_LABEL, METRICS } from "@/lib/noise";
import { headline } from "@/lib/summary";

function getCase(slug: string): DemoCase {
  const c = demoCases.find((x) => x.slug === slug);
  if (!c) throw new Error(`case ${slug} missing`);
  return c;
}

const RULES = [
  {
    market: "EU",
    name: "Commission Regulation (EU) No 655/2013",
    href: "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32013R0655",
    where: "Common criteria for cosmetic claims, adopted under Article 20 of Regulation (EC) No 1223/2009. Annex, points 3 and 4.",
    text: "Claims must be supported by adequate and verifiable evidence, from methods that are valid, reliable and reproducible. Performance must not be presented beyond the available evidence.",
  },
  {
    market: "US",
    name: "FTC Policy Statement Regarding Advertising Substantiation",
    href: "https://www.ftc.gov/legal-library/browse/ftc-policy-statement-regarding-advertising-substantiation",
    where: "1984, with FTC Act Sections 5 and 12 (15 U.S.C. 45 and 52), which cover false advertising of cosmetics.",
    text: "Advertisers need a reasonable basis for an objective claim before the ad runs.",
  },
  {
    market: "Taiwan",
    name: "Cosmetic Hygiene and Safety Act",
    href: "https://law.moj.gov.tw/ENG/LawClass/LawAll.aspx?pcode=L0030013",
    where: "Article 10, with penalties in Article 20.",
    text: "Labels, promotion and advertising must not be false or exaggerated. Breaking Article 10(1) carries a fine of NT$40,000 to 200,000.",
  },
  {
    market: "Taiwan",
    name: "Regulations Governing Criteria for the Label, Promotion, Advertisement with Deception, Exaggeration, or Medical efficacy of Cosmetic Products",
    href: "https://law.moj.gov.tw/ENG/LawClass/LawAll.aspx?pcode=L0030099",
    where: "Article 3.",
    text: "A claim with no evidence, or with evidence that is insufficient to support it, counts as false or exaggerated.",
  },
];

function HeroCard({ c, title, beforeCap, afterCap, note }: { c: DemoCase; title: string; beforeCap: string; afterCap: string; note: string }) {
  const shown = c.evaluation.metrics.filter((m) => Math.round(m.deltaUiPct) !== 0);
  const allowed = c.evaluation.metrics.filter((m) => m.verdict === "claimable");
  const moisture = c.evaluation.metrics.find((m) => m.metric === "moisture")!;
  return (
    <article className={`duo__card ${c.evaluation.badgeAllowed ? "is-ok" : "is-blocked"}`}>
      <p className="duo__title">{title}</p>
      <div className="duo__grid">
        <div className="duo__photos">
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.before.image} alt={`Before: ${beforeCap}`} width={540} height={720} />
            <figcaption>{beforeCap}</figcaption>
          </figure>
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.after.image} alt={`After: ${afterCap}`} width={540} height={720} />
            <figcaption>{afterCap}</figcaption>
          </figure>
        </div>
        <div className="duo__body">
          <p className="duo__label">The app would show</p>
          <div className="badges">
            {shown.map((m) => (
              <span key={m.metric} className="badge badge--sm">
                {badgeText(m.metric, m.deltaUiPct)}
              </span>
            ))}
          </div>
          <p className="duo__label">Claim Guard</p>
          {allowed.length ? (
            <p className="duo__verdict">Allowed: {allowed.map((m) => badgeText(m.metric, m.deltaUiPct)).join(", ")}</p>
          ) : (
            <p className="duo__verdict">Held back</p>
          )}
          <p className="duo__note">{note}</p>
        </div>
      </div>
      <div className="duo__ruler">
        <span>Moisture, raw score change</span>
        <div className="only-wide">
          <NoiseRuler deltaRaw={moisture.deltaRaw} mdc={moisture.mdc95} width={560} />
        </div>
        <div className="only-narrow">
          <NoiseRuler deltaRaw={moisture.deltaRaw} mdc={moisture.mdc95} width={340} />
        </div>
      </div>
    </article>
  );
}

export default function Home() {
  const h = headline(demoData);
  const lampWindow = getCase("lamp-window");
  const lampDesk = getCase("lamp-desk");
  const real = getCase("real-change");
  const s1 = demoData.photos.filter((p) => p.session === "s1");
  const calib = calibrationTable(demoData.photos);

  const b = photo(lampWindow.before.id);
  const a = photo(lampWindow.after.id);
  const toEntries = (s: typeof b.scores) => METRICS.map((m) => ({ type: m, ui_score: s[m]!.ui, raw_score: s[m]!.raw }));
  const request = {
    before: { scores: toEntries(b.scores), image_base64: "<JPEG as base64>" },
    after: { scores: toEntries(a.scores), image_base64: "<JPEG as base64>" },
  };
  const response = toClaimCheckResponse(lampWindow.conditions, lampWindow.evaluation);

  const screen = (c: DemoCase, key: string, tab: string, why: string): PhoneScreen => ({
    key,
    tab,
    beforeImage: c.before.image,
    afterImage: c.after.image,
    rows: c.evaluation.metrics
      .filter((m) => m.metric === "moisture" || m.metric === "radiance")
      .map((m) => ({ label: METRIC_LABEL[m.metric], before: m.before.ui, after: m.after.ui, badge: m.verdict === "claimable" ? badgeText(m.metric, m.deltaUiPct) : null })),
    allowed: c.evaluation.badgeAllowed,
    why,
  });
  const screens = [
    screen(lampDesk, "blocked", "Light changed", "The light in this photo is different from your last scan, so the scores can't be compared yet."),
    screen(real, "allowed", "Same light", ""),
  ];

  return (
    <>
      <header className="top">
        <div className="wrap top__inner">
          <a className="wordmark" href="#">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M7.5 12.5l3 3 6-7" />
            </svg>
            Claim Guard
          </a>
          <SiteNav />
        </div>
      </header>

      <main>
        <section className="hero wrap">
          <div className="hero__text">
            <p className="kicker">Quality check for skin analysis claims</p>
            <h1>Skin score badges, checked against light and retake noise</h1>
            <p className="lede">
              Claim Guard sits between YouCam skin analysis and the badge a beauty app displays. A before/after change goes through when it is larger
              than retake noise and both photos were taken under comparable light. Otherwise the badge is held back with the reason.
            </p>
            <p className="fact">
              We took {h.photoCount} selfies of one face on one day, with no skincare in between. Moving from a ceiling light to a window raised the
              average moisture score from {h.ceilingMoistureUi} to {h.windowMoistureUi} (+{h.lampMoisturePct}%).
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

          <div className="duo">
            <HeroCard
              c={lampDesk}
              title="Lamp changed, nothing else"
              beforeCap="Ceiling light"
              afterCap="Desk spot"
              note="Moisture moved past the noise band, but the light changed between photos."
            />
            <HeroCard
              c={real}
              title="Same light, virtual foundation"
              beforeCap="Untouched"
              afterCap="Foundation"
              note="Capture check passes. Pore and wrinkle stay back: inside noise, or no visible change."
            />
            <p className="demo-tag">Demo data: developer&apos;s own photos</p>
          </div>
        </section>

        <section id="cases" className="section wrap">
          <div className="section__head">
            <h2>Cases</h2>
            <p>
              Real YouCam SD skin analysis results from the developer&apos;s photos. Pick a case to see what the app would display and what Claim
              Guard decides.
            </p>
          </div>
          <CaseExplorer cases={demoCases} />
        </section>

        <section id="how" className="section wrap">
          <div className="section__head">
            <h2>How it decides</h2>
            <p>Four checks, in this order. The first one that applies sets the verdict for each metric.</p>
          </div>
          <ol className="order">
            <li>
              <strong>Same file.</strong> If both photos have the same SHA-256, nothing changed. Sending the same file twice returned identical
              scores, so the API adds no jitter of its own.
            </li>
            <li>
              <strong>Capture conditions.</strong> Four measurements on the photos themselves. If any is outside its limit, every metric is blocked:
              the scores were taken under different light and can&apos;t be compared.
            </li>
            <li>
              <strong>Noise floor.</strong> The raw score must move more than the minimum detectable change (MDC95). Otherwise the change could come
              from retaking the photo.
            </li>
            <li>
              <strong>Display change.</strong> The badge shows the display score (<code>ui_score</code>), so it must move by at least 1 point. A raw
              change the user can&apos;t see is not a claim.
            </li>
          </ol>

          <div className="how-grid">
            <div className="how-card">
              <h3>Noise floor</h3>
              <p>
                From {s1.length} selfies at the desk spot under the same light. The test uses <code>raw_score</code> because <code>ui_score</code> is
                a compressed display scale: same-light retakes move ui by about 1 point, while raw shows the spread.
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
              <p className="formula">MDC95 = 1.96 &times; &radic;2 &times; SD</p>
              <p className="small">
                Each photo carries its own retake error, so the difference of two photos has an SD of &radic;2 &times; SD. A change outside 1.96 of
                those SDs happens by chance less than 5% of the time.
              </p>
            </div>

            <div className="how-card">
              <h3>Capture conditions</h3>
              <p>
                Measured on the photos with no face detection: a central face box and the background strips beside the head. Limits sit between what
                same-light retakes produced and what a lamp change produced.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Check</th>
                      <th>Limit</th>
                      <th>Same light, max</th>
                      <th>Different setup</th>
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
                No single check catches every lamp change. Together they passed {h.pairs.sameLight.passed} of {h.pairs.sameLight.total} same-light
                photo pairs and blocked {h.pairs.changed.blocked} of {h.pairs.changed.total} pairs with a different light or a backlit photo. Run{" "}
                <code>npm run calibrate</code> for the full printout.
              </p>
            </div>
          </div>

          <div className="honesty">
            <h3>What these numbers do and don&apos;t show</h3>
            <p>
              The noise floor and the four limits were calibrated on these {h.photoCount} photos: one face, one phone, one day. So the{" "}
              {h.pairs.sameLight.passed}/{h.pairs.sameLight.total} pass and {h.pairs.changed.blocked}/{h.pairs.changed.total} block are in-sample.
              They show the limits separate these photos. They are not an accuracy figure.
            </p>
            <p>
              <strong>Held-out check: pending (new photos).</strong> <code>npm run calibrate</code> reads a second set from{" "}
              <code>photos/session4/</code> and reports its pass and block rates separately.
            </p>
            <p>A brand would recalibrate with retakes from its own users and devices before relying on these limits.</p>
          </div>
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

        <section id="why" className="section wrap">
          <div className="section__head">
            <h2>Why brands need this</h2>
            <p>
              A before/after skin score in a brand&apos;s app is a claim about its product. Brand compliance and marketing review teams already have to
              back such claims with evidence. A change that a different lamp can produce is weak evidence. Claim Guard gives those teams a logged
              reason for every badge shown or held back, and gives Perfect Corp a trust feature to offer brand clients on top of skin analysis.
            </p>
          </div>
          <div className="rules">
            {RULES.map((r) => (
              <article key={r.name} className="rule">
                <p className="rule__market">{r.market}</p>
                <h3>
                  <a href={r.href} target="_blank" rel="noreferrer">
                    {r.name}
                  </a>
                </h3>
                <p className="rule__where">{r.where}</p>
                <p>{r.text}</p>
              </article>
            ))}
          </div>
          <p className="caveat">
            Claim Guard does not make a claim compliant. It catches one common way a before/after number misleads: photos taken under different
            light, or retake noise read as a result. Sources are the official texts linked above.
          </p>
        </section>

        <section id="brands" className="section wrap">
          <div className="section__head">
            <h2>For brands</h2>
            <p>
              Your app already gets scores from YouCam. Before showing a badge, send those scores and the two photos to Claim Guard. It makes no
              YouCam call of its own, so the check costs no credits.
            </p>
          </div>
          <div className="brand-grid">
            <PhoneMockup screens={screens} />
            <div className="brand-steps">
              <ol className="order order--compact">
                <li>Run YouCam skin analysis on the before and after photos, as you do now.</li>
                <li>
                  <code>POST /api/v1/claim-check</code> with both sets of scores and both photos.
                </li>
                <li>
                  Show a badge only for metrics where <code>badge</code> is not null. Otherwise ask the user to retake in the same light, and log{" "}
                  <code>reason</code> for your review team.
                </li>
              </ol>
              <div className="table-scroll verdict-map">
                <table>
                  <thead>
                    <tr>
                      <th>Verdict</th>
                      <th>Meaning</th>
                      <th>Suggested app copy</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <span className="tag tag--claimable">claimable</span>
                      </td>
                      <td>Raw change past the noise floor, display score moved, same light.</td>
                      <td>Show the badge, e.g. &ldquo;Radiance +11%&rdquo;.</td>
                    </tr>
                    <tr>
                      <td>
                        <span className="tag tag--blocked-conditions">blocked-conditions</span>
                      </td>
                      <td>The two photos were taken under different light.</td>
                      <td>&ldquo;Retake in the same light to see your progress.&rdquo;</td>
                    </tr>
                    <tr>
                      <td>
                        <span className="tag tag--within-noise">within-noise</span>
                      </td>
                      <td>The change is no bigger than retaking the photo.</td>
                      <td>&ldquo;No clear change yet. Check again next week.&rdquo;</td>
                    </tr>
                    <tr>
                      <td>
                        <span className="tag tag--no-visible-change">no-visible-change</span>
                      </td>
                      <td>Raw moved, but the display score did not.</td>
                      <td>No badge for this metric.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
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
            Scores come from the YouCam skin analysis API (Perfect Corp.). Claim Guard is an independent hackathon project and is not affiliated with
            Perfect Corp. MIT licensed.
          </p>
        </div>
      </footer>
    </>
  );
}
