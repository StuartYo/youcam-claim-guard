import { CaseExplorer } from "@/components/CaseExplorer";
import { LiveMode } from "@/components/LiveMode";
import { NoiseRuler } from "@/components/NoiseRuler";
import { PhoneMockup, type PhoneScreen } from "@/components/PhoneMockup";
import { SiteNav } from "@/components/SiteNav";
import { toClaimCheckResponse } from "@/lib/brand-api";
import { CALIBRATION_COLUMNS, calibrationTable } from "@/lib/calibration";
import { APPEARANCE_LABEL, CLAIM_POLICY, policyRows } from "@/lib/claim-policy";
import { demoCases, demoData, getCase, HEADLINE_SLUG, noiseModel, type DemoCase } from "@/lib/demo";
import { badgeText, METRIC_LABEL, METRICS, type Scores } from "@/lib/noise";
import { headline, pairSentence } from "@/lib/summary";

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

/** Public numbers about the problem. Each one was checked on the linked page. */
const FACTS = [
  {
    figure: "10%",
    text: "of 38,995 cosmetic claims checked by 21 EU member states in 2014 and 2015 did not meet the EU claim rules: 3,730 claims.",
    source: "European Commission report COM(2016) 580, 19 September 2016",
    href: "https://data.consilium.europa.eu/doc/document/ST-12496-2016-INIT/en/pdf",
  },
  {
    figure: "28 people",
    text: "and no control group were behind a poster saying an LED face mask was clinically proven to reduce wrinkles in 4 weeks. The UK advertising regulator ruled the ad misleading.",
    source: "ASA ruling on Beauty Pie Ltd, 10 June 2026",
    href: "https://www.asa.org.uk/rulings/beauty-pie-ltd-a25-1322854.html",
  },
];

const KIND_TEXT = { skin: "Skin", appearance: "Appearance" } as const;

function HeroCard({ c }: { c: DemoCase }) {
  const moisture = c.evaluation.metrics.find((m) => m.metric === "moisture")!;
  const blocked = !c.evaluation.badgeAllowed;
  return (
    <article className={`hero-card ${blocked ? "is-blocked" : "is-ok"}`}>
      <div className="hero-card__head">
        <p className="hero-card__title">{c.title}</p>
        <p className="demo-tag">Demo data: developer&apos;s own photos</p>
      </div>
      <p className="hero-card__label">Moisture, change in raw score between the two photos</p>
      <div className="only-wide">
        <NoiseRuler deltaRaw={moisture.deltaRaw} mdc={moisture.mdc95} width={380} />
      </div>
      <div className="only-narrow">
        <NoiseRuler deltaRaw={moisture.deltaRaw} mdc={moisture.mdc95} width={300} />
      </div>
      <p className="hero-card__legend">
        The shaded band is what retaking the same photo produces. This change lands outside it, so a noise check alone would show the badge.
      </p>
      <div className="hero-card__foot">
        <div className="hero-card__photos">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.before.image} alt={`Before: ${c.before.caption}`} width={540} height={720} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.after.image} alt={`After: ${c.after.caption}`} width={540} height={720} />
        </div>
        <div className="hero-card__verdict">
          <p className="duo__label">The app would show</p>
          <span className="badge badge--sm">{badgeText("moisture", moisture.deltaUiPct)}</span>
          <p className="duo__label">Claim Guard</p>
          <p className="duo__verdict">{blocked ? "Blocked: the light differs" : "Allowed"}</p>
        </div>
      </div>
    </article>
  );
}

/** Pretty JSON with every flat object on one line, so the code boxes stay short. */
const compactJson = (v: unknown) => JSON.stringify(v, null, 2).replace(/\{\n\s+([^{}\[\]]*?)\n\s+\}/g, (_m, body: string) => `{ ${body.replace(/\n\s+/g, " ")} }`);

const toEntries = (s: Scores) => METRICS.map((m) => ({ type: m, ui_score: s[m]!.ui, raw_score: s[m]!.raw }));

export default function Home() {
  const h = headline(demoData);
  const hero = getCase(HEADLINE_SLUG);
  const roomDesk = getCase("room-desk");
  const real = getCase("real-change");
  const s1 = demoData.photos.filter((p) => p.session === "s1");
  const calib = calibrationTable(demoData.photos);
  const policy = policyRows();

  const sim = demoData.simulated!.find((x) => x.id === real.after.id)!;
  const base = demoData.baselines!.find((x) => x.id === real.before.id)!;
  const request = {
    product_category: "foundation",
    before: { scores: toEntries(base.scores), image_base64: "<JPEG as base64>" },
    after: { scores: toEntries(sim.scores), image_base64: "<JPEG as base64>" },
  };
  const response = toClaimCheckResponse(real.conditions, real.evaluation);

  const rows = (c: DemoCase) =>
    c.evaluation.metrics
      .filter((m) => m.metric === "moisture" || m.metric === "radiance")
      .map((m) => ({
        label: METRIC_LABEL[m.metric],
        before: m.before.ui,
        after: m.after.ui,
        badge: m.verdict === "claimable" ? badgeText(m.metric, m.deltaUiPct) : null,
        note:
          m.verdict === "blocked-claim-type"
            ? "No claim: foundation is makeup"
            : m.verdict === "claimable" && m.claimKind === "appearance"
              ? "With foundation on"
              : undefined,
      }));
  const screens: PhoneScreen[] = [
    {
      key: "blocked",
      tab: "Light changed",
      beforeImage: roomDesk.before.image,
      afterImage: roomDesk.after.image,
      rows: rows(roomDesk),
      allowed: false,
      why: "The light in this photo is different from your last scan, so the scores can't be compared yet.",
    },
    {
      key: "allowed",
      tab: "Same light, foundation",
      beforeImage: real.before.image,
      afterImage: real.after.image,
      rows: rows(real),
      allowed: true,
      why: "Same light as your last scan. Radiance describes how your skin looks with foundation on.",
    },
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
            <h1>Skin score badges, checked before the app shows them</h1>
            <p className="lede">
              Claim Guard sits between YouCam skin analysis and the badge a beauty app shows. A before/after change gets a badge only when it is
              larger than retake noise, both photos were taken in comparable light, and the product can cause that kind of change. Otherwise the
              badge is blocked and the reason is logged.
            </p>
            <p className="fact">
              We took {h.photoCount} selfies of one face on one day, with no skincare in between. Moving from a ceiling light in another room to a
              window raised the average moisture score from {h.ceilingMoistureUi} to {h.windowMoistureUi} (+{h.lampMoisturePct}%).
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
          <HeroCard c={hero} />
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
            <p>Claim Guard runs five checks in order, and the first one that applies decides what happens to each badge.</p>
          </div>
          <ol className="order">
            <li>
              <strong>Same file.</strong> Two identical files mean nothing changed, so every metric is within noise.
            </li>
            <li>
              <strong>Claim type.</strong> When the brand names the product category, a metric that category can&apos;t change is blocked.
              Foundation can&apos;t claim moisture.
            </li>
            <li>
              <strong>Capture conditions.</strong> If the light differs between the photos, every metric is blocked.
            </li>
            <li>
              <strong>Noise floor.</strong> The change must be bigger than what retaking the same photo produces.
            </li>
            <li>
              <strong>Display change.</strong> The badge shows the display score, so that score must move by at least 1 point.
            </li>
          </ol>

          <details className="maths">
            <summary>The maths behind the checks</summary>
            <div className="maths__body">
              <p>
                <strong>Same file</strong> compares the SHA-256 hash of both uploads. Sending the same file to YouCam twice returned identical
                scores, so the API adds no jitter of its own.
              </p>
              <p>
                <strong>Noise floor</strong> uses <code>raw_score</code>, because <code>ui_score</code> is a compressed display scale: same-light
                retakes move ui by about 1 point while raw shows the spread. The limit is the minimum detectable change at 95%:
              </p>
              <p className="formula">MDC95 = 1.96 &times; &radic;2 &times; SD</p>
              <p>
                Each photo carries its own retake error, so the difference of two photos has an SD of &radic;2 &times; SD. A change outside 1.96 of
                those SDs happens by chance less than 5% of the time.
              </p>
            </div>
          </details>

          <div className="how-grid">
            <div className="how-card">
              <h3>Noise floor</h3>
              <p>From {s1.length} selfies at the desk spot under the same light.</p>
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
            </div>

            <div className="how-card">
              <h3>Capture conditions</h3>
              <p>
                Measured on a fixed central face box and the background strips beside the head. There is no face detection, so a selfie needs to be
                roughly centred. Limits sit between what same-spot retakes produced and what a different room and light produced.
              </p>
              <table className="stack-sm">
                <thead>
                  <tr>
                    {CALIBRATION_COLUMNS.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {calib.map((r) => (
                    <tr key={r.id}>
                      <td data-label={CALIBRATION_COLUMNS[0]}>
                        {r.label}
                        <span className="td-sub">{r.measures}</span>
                      </td>
                      <td className="num" data-label={CALIBRATION_COLUMNS[1]}>
                        {r.limit}
                      </td>
                      <td className="num" data-label={CALIBRATION_COLUMNS[2]}>
                        {r.sameSetup}
                      </td>
                      <td className="num" data-label={CALIBRATION_COLUMNS[3]}>
                        {r.acrossSetups}
                        {r.note && <span className="td-sub">{r.note}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="small">
                No single check catches every change. {pairSentence(h.pairs)} Run <code>npm run calibrate</code> for the full printout.
              </p>
            </div>
          </div>

          <div className="how-card how-card--wide">
            <h3>Claim type policy</h3>
            <p>
              Which metrics each product category may make claims about. This is a configurable policy a brand&apos;s compliance team would edit,
              not a regulation. &ldquo;Appearance&rdquo; means the badge carries the label &ldquo;{APPEARANCE_LABEL.toLowerCase()}&rdquo;.
            </p>
            <table className="stack-sm policy">
              <thead>
                <tr>
                  <th>Category</th>
                  {METRICS.map((m) => (
                    <th key={m}>{METRIC_LABEL[m]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {policy.map((r) => (
                  <tr key={r.category}>
                    <td data-label="Category">
                      <code>{r.category}</code>
                      {CLAIM_POLICY[r.category].makeup && <span className="td-sub">makeup</span>}
                    </td>
                    {r.metrics.map((m) => (
                      <td key={m.metric} data-label={METRIC_LABEL[m.metric]} className={m.kind ? `kind kind--${m.kind}` : "kind kind--no"}>
                        {m.kind ? KIND_TEXT[m.kind] : "No claim"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="honesty">
            <h3>What these numbers do and don&apos;t show</h3>
            <p>
              The noise floor and the four limits were calibrated on these {h.photoCount} photos: one face, one phone, one day. So the pass and block
              counts above are in-sample. They show the limits separate these photos. They are not an accuracy figure.
            </p>
            <p>
              <strong>Held-out check: pending (new photos).</strong> <code>npm run calibrate</code> reads a second set from{" "}
              <code>photos/session4/</code> and reports its pass and block rates separately.
            </p>
            <p>
              The face box is fixed. We ran an offline face detector over all 17 demo images: it found one face in each, and the box sat inside it
              left to right, but its top edge reaches the forehead and, in the window photos, the hairline. We kept the fixed box because the
              detector would add about 300 MB of dependencies and change every stored measurement.
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
              A before/after skin score in a brand&apos;s app is a claim about its product, and regulators already ask for evidence behind such
              claims. A change that a different room can produce is weak evidence. Claim Guard gives compliance and marketing review teams a logged
              reason for every badge shown or blocked, and gives Perfect Corp a trust feature to offer brand clients on top of skin analysis.
            </p>
          </div>
          <div className="facts">
            {FACTS.map((f) => (
              <article key={f.figure} className="fact-card">
                <p className="fact-card__figure">{f.figure}</p>
                <p>{f.text}</p>
                <a href={f.href} target="_blank" rel="noreferrer">
                  {f.source}
                </a>
              </article>
            ))}
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
            Claim Guard does not make a claim compliant. It catches common ways a before/after number misleads: photos taken under different light,
            retake noise read as a result, and a product claiming a change it can&apos;t cause. Sources are the official texts linked above.
          </p>
        </section>

        <section id="brands" className="section wrap">
          <div className="section__head">
            <h2>For brands</h2>
            <p>
              Your app already gets scores from YouCam. Before showing a badge, send those scores, the two photos and the product category to Claim
              Guard. It makes no YouCam call of its own, so the check costs no credits.
            </p>
          </div>
          <div className="brand-grid">
            <PhoneMockup screens={screens} />
            <div className="brand-steps">
              <ol className="order order--compact">
                <li>Run YouCam skin analysis on the before and after photos, as you do now.</li>
                <li>
                  <code>POST /api/v1/claim-check</code> with both sets of scores, both photos and <code>product_category</code>.
                </li>
                <li>
                  Show a badge only where <code>badge</code> is not null, with <code>badge_label</code> next to it when present. Otherwise follow the
                  verdict below, and log <code>reason</code> for your review team.
                </li>
              </ol>
              <div className="verdict-map">
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
                    <td>Raw change past the noise floor, display score moved, same light, product may claim it.</td>
                    <td>Show the badge, e.g. &ldquo;Radiance +11%&rdquo;, plus the appearance label for makeup.</td>
                  </tr>
                  <tr>
                    <td>
                      <span className="tag tag--blocked-claim-type">blocked-claim-type</span>
                    </td>
                    <td>The product category can&apos;t make this claim.</td>
                    <td>No badge for this metric.</td>
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
                <code>{`POST /api/v1/claim-check\nContent-Type: application/json\n\n${compactJson(request)}`}</code>
              </pre>
            </div>
            <div className="code">
              <p className="code__title">Response (the virtual foundation case)</p>
              <pre>
                <code>{JSON.stringify(response, null, 2)}</code>
              </pre>
            </div>
          </div>
          <p className="small">
            Accepts YouCam&apos;s <code>output</code> entries as returned, or a <code>{`{ "moisture": { "ui": 74, "raw": 59.9 } }`}</code> map.{" "}
            <code>product_category</code> is optional; without it the claim-type check is skipped. Photos up to 4 MB each, JPEG or PNG; 30 requests
            per minute per address.
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
