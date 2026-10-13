import { AuditLog } from "@/components/AuditLog";
import { CaseExplorer } from "@/components/CaseExplorer";
import { LiveMode } from "@/components/LiveMode";
import { NoiseRuler } from "@/components/NoiseRuler";
import { PhoneMockup, type PhoneScreen } from "@/components/PhoneMockup";
import { SiteNav } from "@/components/SiteNav";
import { auditEntry } from "@/lib/audit";
import { toClaimCheckResponse } from "@/lib/brand-api";
import { CALIBRATION_COLUMNS, calibrationTable } from "@/lib/calibration";
import { APPEARANCE_LABEL, CLAIM_POLICY, policyRows } from "@/lib/claim-policy";
import { demoCases, demoData, getCase, HEADLINE_SLUG, noiseModel, type DemoCase } from "@/lib/demo";
import { failingText, heldOutTally, HELD_OUT_SETUPS, pctOf, type PairCount } from "@/lib/heldout";
import { badgeText, isGainBadge, METRIC_HINT, METRIC_LABEL, METRICS, type Scores } from "@/lib/noise";
import { noiseGroups, noiseModelFile, pairsPastFloor } from "@/lib/noise-groups";
import { headline, pairSentence, sameRoomHeadline } from "@/lib/summary";

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
    text: "Labels, promotion and advertising must not be false or exaggerated. Breaking Article 10(1) carries a fine of NT$40,000 to 200,000, and the fine can be imposed again for each further run of the ad.",
  },
  {
    market: "Taiwan",
    name: "Regulations Governing Criteria for the Label, Promotion, Advertisement with Deception, Exaggeration, or Medical efficacy of Cosmetic Products",
    href: "https://law.moj.gov.tw/ENG/LawClass/LawAll.aspx?pcode=L0030099",
    where: "Article 3.",
    text: "A claim with no evidence, or with evidence that is insufficient to support it, counts as false or exaggerated.",
  },
];

/** Public numbers. Each one was checked on the linked page. */
const FACTS = [
  {
    figure: "859",
    text: "brand clients in Perfect Corp's cumulative customer base at the end of 2025, with over 982,000 digital SKUs. Each is a possible user of a claim check on top of skin analysis.",
    source: "Perfect Corp results release, 24 February 2026",
    href: "https://www.businesswire.com/news/home/20260224503932/en/",
  },
  {
    figure: "10%",
    text: "of 38,995 cosmetic claims checked by 21 EU member states in 2014 and 2015 did not meet the EU claim rules: 3,730 claims.",
    source: "European Commission report COM(2016) 580",
    href: "https://data.consilium.europa.eu/doc/document/ST-12496-2016-INIT/en/pdf",
  },
  {
    figure: "47%",
    text: "fewer fine lines and wrinkles, next to before/after photos, in a skincare ad the UK advertising regulator banned in 2012: it saw no evidence for the figures or that the photos were genuine.",
    source: "ASA ruling on Rejuvenex Direct UK Ltd, 10 October 2012",
    href: "https://www.asa.org.uk/rulings/rejuvenex-direct-uk-ltd-a12-204197.html",
  },
  {
    figure: "27 to 10",
    text: "was the wrinkle score from a skin-imaging device quoted in a TV ad the same regulator cleared in 2016. The study used an untreated control eye and a blinded assessor, and the ad said the effect was temporary.",
    source: "ASA ruling on The Perfect Cosmetics Company Ltd, 7 September 2016",
    href: "https://asa.org.uk/rulings/the-perfect-cosmetics-company-ltd-a16-333552.html",
  },
];

/** Illustrative price. Our assumption, not a quote or a Perfect Corp price. */
const ASSUMED_PRICE_NTD = 1;
const TAIWAN_MIN_FINE_NTD = 40_000;

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
      <p className="hero-card__label">Moisture, change in raw score for this pair of photos</p>
      <div className="only-wide">
        <NoiseRuler deltaRaw={moisture.deltaRaw} mdc={moisture.mdc95} width={380} />
      </div>
      <div className="only-narrow">
        <NoiseRuler deltaRaw={moisture.deltaRaw} mdc={moisture.mdc95} width={300} />
      </div>
      <p className="hero-card__legend">
        The shaded band is what retaking the same photo produces.{" "}
        {moisture.aboveNoise
          ? "This change lands outside it, so a noise check alone would show the badge."
          : "This change lands inside it, so it can be retake noise."}
      </p>
      <div className="hero-card__foot">
        <div className="hero-card__photos">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.before.image} alt={`Before: ${c.before.caption}`} width={540} height={720} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.after.image} alt={`After: ${c.after.caption}`} width={540} height={720} />
        </div>
        <div className="hero-card__verdict">
          <p className="duo__label">For this pair the app would show</p>
          <span className="badge badge--sm">{badgeText("moisture", moisture.deltaUiPct)}</span>
          <p className="duo__label">Claim Guard</p>
          <p className="duo__verdict">{blocked ? "Blocked: photos not comparable" : "Allowed"}</p>
        </div>
      </div>
    </article>
  );
}

/** Pretty JSON with every flat object on one line, so the code boxes stay short. */
const compactJson = (v: unknown) => JSON.stringify(v, null, 2).replace(/\{\n\s+([^{}\[\]]*?)\n\s+\}/g, (_m, body: string) => `{ ${body.replace(/\n\s+/g, " ")} }`);

const toEntries = (s: Scores) => METRICS.map((m) => ({ type: m, ui_score: s[m]!.ui, raw_score: s[m]!.raw }));

const passText = (c: PairCount) => `${c.passed}/${c.total} pass (${pctOf(c.passed, c.total)})`;
const blockText = (c: PairCount) => `${c.total - c.passed}/${c.total} blocked (${pctOf(c.total - c.passed, c.total)})`;

const SNIPPET = `import { claimCheck } from "./claim-check"; // examples/claim-check.ts

const r = await claimCheck({
  baseUrl: "https://your-claim-guard-host",
  before: { scores: youcamBefore.output, photo: beforeJpeg },
  after: { scores: youcamAfter.output, photo: afterJpeg },
  productCategory: "moisturizer",
});
for (const m of r.metrics) {
  if (m.badge) showBadge(m.badge, m.badge_label);
  else logForReview(m.metric, m.verdict, m.reason);
}`;

const MCP_CONFIG = `{
  "mcpServers": {
    "youcam-beauty": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp-api-01.makeupar.com/mcp/beauty",
               "--header", "Authorization:\${AUTH_HEADER}"],
      "env": { "AUTH_HEADER": "Bearer YOUR_API_KEY" }
    },
    "claim-guard": {
      "command": "node",
      "args": ["C:/path/to/youcam-claim-guard/node_modules/tsx/dist/cli.mjs",
               "C:/path/to/youcam-claim-guard/mcp/server.ts"]
    }
  }
}`;

export default function Home() {
  const h = headline(demoData);
  const hero = getCase(HEADLINE_SLUG);
  const heroMoisture = hero.evaluation.metrics.find((m) => m.metric === "moisture")!;
  const roomDesk = getCase("room-desk");
  const real = getCase("real-change");
  const room = sameRoomHeadline(demoData);
  const noiseFile = noiseModelFile(demoData);
  const heldOutGroups = noiseGroups(demoData).filter((g) => g.heldOut);
  const floorOf = (k: "metrics" | "session1Only") => Object.fromEntries(METRICS.map((m) => [m, noiseFile[k][m].mdc95])) as Record<(typeof METRICS)[number], number>;
  const pastS1 = pairsPastFloor(heldOutGroups, floorOf("session1Only"));
  const pastPooled = pairsPastFloor(heldOutGroups, floorOf("metrics"));
  const shots = (demoData.heldOut ?? []).map((p) => ({ id: p.id, setup: p.setup!, capture: p.capture }));
  const v1 = shots.length ? heldOutTally(shots, 1) : null;
  const v2 = shots.length ? heldOutTally(shots, 2) : null;
  const calib = calibrationTable(demoData.photos);
  const policy = policyRows();
  const audit = demoCases.map((c) => auditEntry(c.slug, "2026-10-13", "demo case", c.conditions, c.evaluation));

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
        hint: METRIC_HINT[m.metric],
        before: m.before.ui,
        after: m.after.ui,
        badge: isGainBadge(m) ? badgeText(m.metric, m.deltaUiPct) : null,
        note:
          m.verdict === "blocked-claim-type"
            ? "No claim: foundation is makeup"
            : isGainBadge(m) && m.claimKind === "appearance"
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
            {room ? (
              <p className="fact">
                Same face, same room, no skincare in between. Switching from the ceiling light to a desk lamp, with the phone re-positioned, raised
                the average moisture score of four shots each from {room.moistureCeilingUi} to {room.moistureLampUi} (+{room.moisturePct}%). The pair
                in the card is one of those pairs: moisture {badgeText("moisture", heroMoisture.deltaUiPct).replace("Moisture ", "")}.
              </p>
            ) : (
              <p className="fact">
                We took {h.photoCount} selfies of one face on one day, with no skincare in between. Moving from a ceiling light in another room to a
                window raised the average moisture score from {h.ceilingMoistureUi} to {h.windowMoistureUi} (+{h.lampMoisturePct}%).
              </p>
            )}
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
              Real YouCam SD skin analysis results from the developer&apos;s photos: one face, one phone. All four YouCam scores are higher-is-better,
              so a higher wrinkle score means fewer wrinkles.
            </p>
          </div>
          <CaseExplorer cases={demoCases} />
        </section>

        <section id="how" className="section wrap">
          <div className="section__head">
            <h2>How it decides</h2>
            <p>Five checks run in order, and the first one that applies decides what happens to each badge.</p>
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
              <strong>Display change.</strong> The badge shows the display score, so that score must go up by at least 1 point.
            </li>
          </ol>
          {v2 && (
            <p className="conclusion">
              On the developer&apos;s first {h.photoCount} photos, all {h.pairs.changed.total} pairs with a changed setup were blocked and all{" "}
              {h.pairs.sameSetup.total} same-light retake pairs passed; on {v2.photos} photos from a later evening,{" "}
              {v2.differentLight.total - v2.differentLight.passed} of {v2.differentLight.total} changed-light pairs were blocked and{" "}
              {v2.sameLightSkinChange.passed} of {v2.sameLightSkinChange.total} same-lamp pairs before and after a moisturizer passed.
            </p>
          )}

          <details className="method">
            <summary>
              <span>Method and limits</span>
              <small>Noise floor, capture limits, claim policy, the later-evening check and what these numbers don&apos;t show</small>
            </summary>
            <div className="method__body">
              <div className="how-grid">
                <div className="how-card">
                  <h3>Noise floor</h3>
                  <p>
                    Uses <code>raw_score</code>, because <code>ui_score</code> is a compressed display scale. SD within {noiseFile.groups.length} sets
                    of retakes, each at one spot under one light with nothing changed, pooled across the sets ({noiseFile.metrics.moisture.n} photos).
                    Each set keeps its own average, so a light change between sets never counts as noise. MDC95 = 1.96 &times; &radic;2 &times; SD: a
                    change beyond it happens by chance under 5% of the time.
                  </p>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Metric</th>
                          <th>Pooled SD</th>
                          <th>MDC95 (used)</th>
                          <th>Session 1 only</th>
                        </tr>
                      </thead>
                      <tbody>
                        {METRICS.map((m) => (
                          <tr key={m}>
                            <td>{METRIC_LABEL[m]}</td>
                            <td className="num">{noiseModel[m].sd.toFixed(2)}</td>
                            <td className="num">&plusmn;{noiseModel[m].mdc95.toFixed(2)}</td>
                            <td className="num">&plusmn;{noiseFile.session1Only[m].mdc95.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="small">
                    Sets: {noiseFile.groups.map((g) => `${g.label} (${g.ids.length})`).join(", ")}. The window session is left out because every
                    photo in it is backlit. Sending the same file twice returned identical scores, so the API adds no jitter of its own.
                  </p>
                </div>

                <div className="how-card">
                  <h3>Capture conditions</h3>
                  <p>
                    Measured on a fixed central face box and the background strips beside the head. Face brightness is divided by background
                    brightness, so a uniform exposure change cancels out, and light colour is read from the background, which skincare does not
                    change. Limits sit between what same-spot retakes and a different room and light produced on the first {h.photoCount} photos.
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
                    No single check catches every change. {pairSentence(h.pairs)} These counts are in-sample. Run <code>npm run calibrate</code> for
                    the full printout.
                  </p>
                </div>
              </div>

              <div className="how-card how-card--wide">
                <h3>Claim type policy</h3>
                <p>
                  Which metrics each product category may make claims about. A configurable policy a brand&apos;s compliance team would edit, not a
                  regulation. &ldquo;Appearance&rdquo; means the badge carries the label &ldquo;{APPEARANCE_LABEL.toLowerCase()}&rdquo;.
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

              {v1 && v2 && (
                <div className="how-card how-card--wide heldout">
                  <h3>Later-evening check, before and after a design change</h3>
                  <p>Twelve more photos of the same face from a different evening, four shots each under three setups:</p>
                  <ul className="heldout__setups">
                    {Object.entries(HELD_OUT_SETUPS).map(([k, v]) => (
                      <li key={k}>
                        <strong>{k}.</strong> {v.note}
                      </li>
                    ))}
                  </ul>
                  <table className="stack-sm">
                    <thead>
                      <tr>
                        <th>Pairs (ordered)</th>
                        <th>Expected</th>
                        <th>Version 1, limits frozen</th>
                        <th>Version 2, current</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td data-label="Pairs">Same setup (A-A, B-B, C-C)</td>
                        <td data-label="Expected">Pass</td>
                        <td className="num" data-label="Version 1">
                          {passText(v1.sameSetup)}
                          <span className="td-sub">fails: {failingText(v1.sameSetup)}</span>
                        </td>
                        <td className="num" data-label="Version 2">
                          {passText(v2.sameSetup)}
                          <span className="td-sub">fails: {failingText(v2.sameSetup)}</span>
                        </td>
                      </tr>
                      <tr>
                        <td data-label="Pairs">Different light (A-B, A-C)</td>
                        <td data-label="Expected">Blocked</td>
                        <td className="num" data-label="Version 1">
                          {blockText(v1.differentLight)}
                        </td>
                        <td className="num" data-label="Version 2">
                          {blockText(v2.differentLight)}
                        </td>
                      </tr>
                      <tr>
                        <td data-label="Pairs">Same lamp, before and after moisturizer (B-C)</td>
                        <td data-label="Expected">Pass</td>
                        <td className="num" data-label="Version 1">
                          {passText(v1.sameLightSkinChange)}
                          <span className="td-sub">fails: {failingText(v1.sameLightSkinChange)}</span>
                        </td>
                        <td className="num" data-label="Version 2">
                          {passText(v2.sameLightSkinChange)}
                          <span className="td-sub">fails: {failingText(v2.sameLightSkinChange)}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <p>
                    <strong>Version 1</strong> was frozen on the first {h.photoCount} photos and never saw these twelve, so its column is a true
                    held-out result. It read light colour from the face and face brightness on its own. After washing and moisturizer the face
                    measured redder, which it read as warmer light, and it blocked most same-lamp pairs.
                  </p>
                  <p>
                    <strong>Version 2</strong> reads light colour from the background and divides face brightness by background brightness. These
                    twelve photos showed us why version 1 failed, so they informed the change and its column is not a strict held-out result. The
                    limit values (10%, 15%, 2%) were checked on the first {h.photoCount} photos only and not tuned to make any case pass. The
                    remaining failures are real: in set B the face got brighter from shot to shot relative to the background under the same lamp.
                  </p>
                  <p>
                    The same photos made the noise floor wider. Under the session 1 floor, {pastS1.moisture.past} of {pastS1.moisture.pairs}{" "}
                    same-setup pairs moved moisture past it and {pastS1.wrinkle.past} of {pastS1.wrinkle.pairs} moved wrinkle past it, where about 1
                    in 20 is expected. With the pooled floor, {pastPooled.moisture.past}, {pastPooled.pore.past}, {pastPooled.wrinkle.past} and{" "}
                    {pastPooled.radiance.past} of {pastPooled.moisture.pairs} still do, for moisture, pore, wrinkle and radiance. That count is
                    in-sample, and the floor may still be too tight.
                  </p>
                </div>
              )}

              <div className="honesty">
                <h3>What these numbers don&apos;t show</h3>
                <p>
                  Everything here comes from one face and one phone. The face box is fixed: an offline face detector found one face in each of the
                  17 demo images and the box sat inside it left to right, but its top edge reaches the forehead and, in the window photos, the
                  hairline. We kept the fixed box because the detector would add about 300 MB of dependencies and change every stored measurement.
                  A brand would recalibrate with retakes from its own users and devices before relying on these limits.
                </p>
              </div>
            </div>
          </details>
        </section>

        <section id="live" className="section wrap">
          <div className="section__head">
            <h2>Try your own photos</h2>
            <p>
              The capture check runs first and costs nothing. Skin analysis runs only after you agree, and it uses real YouCam credits, so this demo
              has a daily cap.
            </p>
          </div>
          <LiveMode />
        </section>

        <section id="audit" className="section wrap">
          <div className="section__head">
            <h2>Audit log</h2>
            <p>
              Every claim check with its time, product, per-metric verdict, reason and the limits used, for a compliance team to review or export.
              The demo cases are listed; sample and live checks you run here are added on top. Rows stay in this browser tab.
            </p>
          </div>
          <AuditLog initial={audit} />
        </section>

        <section id="why" className="section wrap">
          <div className="section__head section__head--top">
            <h2>Why brands need this</h2>
            <p>
              A before/after skin score in a brand&apos;s app is a claim about its product, and regulators ask for evidence behind it. Claim Guard
              logs a reason for every badge it shows or blocks.
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
          <div className="business">
            <h3>What a check costs against what a claim can cost</h3>
            <ul>
              <li>
                <strong>Assumed price: NT${ASSUMED_PRICE_NTD} per check.</strong> This is our assumption for illustration, not a quote and not a
                Perfect Corp price.
              </li>
              <li>
                <strong>Taiwan:</strong> a false or exaggerated cosmetic claim costs NT${TAIWAN_MIN_FINE_NTD.toLocaleString("en-US")} to 200,000
                (Cosmetic Hygiene and Safety Act, Article 20), and the fine can repeat for each further run of the ad. The minimum fine pays for{" "}
                {(TAIWAN_MIN_FINE_NTD / ASSUMED_PRICE_NTD).toLocaleString("en-US")} checks at the assumed price.
              </li>
              <li>
                <strong>UK:</strong> since April 2025 the Competition and Markets Authority can fine a business up to 10% of global turnover for
                breaking consumer law (
                <a
                  href="https://www.gov.uk/government/news/cma-to-boost-consumer-and-business-confidence-as-new-consumer-protection-regime-comes-into-force"
                  target="_blank"
                  rel="noreferrer"
                >
                  gov.uk, 7 April 2025
                </a>
                ).
              </li>
              <li>
                <strong>Scale:</strong> if each of Perfect Corp&apos;s 859 brand clients ran 1,000 checks a month at the assumed price, that is NT$
                {(859 * 1000 * ASSUMED_PRICE_NTD).toLocaleString("en-US")} a month of add-on revenue on top of skin analysis. The volume and the price are
                our assumptions; only the client count is reported.
              </li>
            </ul>
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
            retake noise read as a result, and a product claiming a change it can&apos;t cause. We found no public enforcement case about a
            skin-analysis app itself; the cases above are about skincare ads.
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
                      <td>Raw change past the noise floor, display score moved, same light, product may claim it. A drop is real but gets no badge.</td>
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
              <pre className="json-box">
                <code>{`POST /api/v1/claim-check\nContent-Type: application/json\n\n${compactJson(request)}`}</code>
              </pre>
            </div>
            <div className="code code--fade">
              <p className="code__title">Response (the virtual foundation case)</p>
              <pre className="json-box">
                <code>{JSON.stringify(response, null, 2)}</code>
              </pre>
            </div>
          </div>
          <p className="small">
            Accepts YouCam&apos;s <code>output</code> entries as returned, or a <code>{`{ "moisture": { "ui": 74, "raw": 59.9 } }`}</code> map.{" "}
            <code>product_category</code> is optional; without it the claim-type check is skipped. Photos up to 4 MB each, JPEG or PNG; 30 requests
            per minute per address.
          </p>

          <div className="code-grid code-grid--tools">
            <div className="code">
              <p className="code__title">In your backend: examples/claim-check.ts</p>
              <pre className="json-box">
                <code>{SNIPPET}</code>
              </pre>
            </div>
            <div className="code">
              <p className="code__title">In Claude Desktop, next to YouCam&apos;s MCP server</p>
              <pre className="json-box">
                <code>{MCP_CONFIG}</code>
              </pre>
            </div>
          </div>
          <p className="small">
            <code>npm run mcp</code> starts a local MCP server with two tools: <code>claim_check</code> (scores plus two photo paths or base64, and
            an optional product category) and <code>explain_thresholds</code>. An assistant can run YouCam&apos;s skin analysis through
            YouCam&apos;s own MCP server, then check the claim with Claim Guard before writing a badge.
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
