# Claim Guard

A QA check for beauty apps that show before/after skin scores from the YouCam skin analysis API.

Before the app shows a badge like "Moisture +12%", Claim Guard answers three questions:

1. Is the change larger than what retaking the same photo produces? (noise floor)
2. Were both photos taken under comparable light? (capture conditions)
3. Can this product cause this kind of change? (claim type: foundation can't claim moisture)

If any answer is no, the badge is blocked and the reason is returned.

## Why

We took 15 selfies of the same face on the same day with no skincare in between, under three setups, and ran each through YouCam SD skin analysis (`docs/noise-floor-2026-10-13.md`).

- Same light, nothing changed: `ui_score` moves about ±1, `raw_score` SD is 1 to 2.
- Moving to a different room and light (ceiling light in one room, a bright window in another) moved average moisture from ui 73.3 to 80.0 (+9.1%), raw 58.2 to 77.0.
- The same file sent twice returns identical scores. The jitter comes from the photo, not the API.

A "+9% moisture" claim can be produced by moving to a different room.

Numbers in this README, the docs and the page come from `data/scores.json` with one rounding rule (half up, `fix()` in `lib/summary.ts`). `tests/docs-consistency.test.ts` fails if a quoted number drifts from the data.

## Why brands need this

Before/after skin scores are a claim about a product. The rules below already ask brands to back such claims with evidence. A score change that a different room can produce is weak evidence. Claim Guard gives the brand's compliance or marketing review team a logged reason for every badge it shows or blocks, and gives Perfect Corp a trust feature to offer its brand clients on top of the skin analysis API.

Two public numbers on the problem:

- 21 EU member states checked 38,995 cosmetic claims in 2014 and 2015; 3,730 (10%) did not meet the EU claim rules. [European Commission report COM(2016) 580, 19 September 2016](https://data.consilium.europa.eu/doc/document/ST-12496-2016-INIT/en/pdf), section 3.3.
- On 10 June 2026 the UK Advertising Standards Authority ruled misleading a poster saying an LED face mask was "clinically proven to reduce wrinkles in 4 weeks". The study behind it had 28 people and no control or placebo group. [ASA ruling on Beauty Pie Ltd](https://www.asa.org.uk/rulings/beauty-pie-ltd-a25-1322854.html).

| Market | Rule | What it asks for |
|---|---|---|
| EU | [Commission Regulation (EU) No 655/2013](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32013R0655), common criteria for cosmetic claims, adopted under Article 20 of Regulation (EC) No 1223/2009 | Annex point 3, evidential support: claims must be supported by adequate and verifiable evidence, from methods that are valid, reliable and reproducible. Point 4: performance must not be presented beyond the available evidence. |
| US | [FTC Policy Statement Regarding Advertising Substantiation](https://www.ftc.gov/legal-library/browse/ftc-policy-statement-regarding-advertising-substantiation) (1984), with FTC Act Sections 5 and 12 (15 U.S.C. 45, 52), which cover false advertising of cosmetics | Advertisers need a reasonable basis for objective claims before the ad runs. |
| Taiwan | [Cosmetic Hygiene and Safety Act](https://law.moj.gov.tw/ENG/LawClass/LawAll.aspx?pcode=L0030013), Article 10, penalties in Article 20 | Labels, promotion and advertising must not be false or exaggerated. Breaking Article 10(1) carries a fine of NT$40,000 to 200,000. |
| Taiwan | [Regulations Governing Criteria for the Label, Promotion, Advertisement with Deception, Exaggeration, or Medical efficacy of Cosmetic Products](https://law.moj.gov.tw/ENG/LawClass/LawAll.aspx?pcode=L0030099), Article 3 | A claim with no evidence, or evidence insufficient to support it, counts as false or exaggerated. |

Claim Guard does not make a claim compliant. It catches common ways a before/after number misleads: comparing photos taken under different light, reading retake noise as a result, and a product claiming a change it can't cause.

## Run it

Requires Node 20 or later.

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # vitest
npm run build        # NEXT_DIST_DIR=.next-prod npm run build builds next to a running dev server
npm run calibrate    # capture-threshold numbers, plus a held-out check if photos/session4/ exists
npm run cover        # renders submission/cover.png (1500 x 1000) from HTML with Playwright
```

Demo mode needs nothing else. Live mode needs a YouCam API key:

| Variable | Default | Purpose |
|---|---|---|
| `YOUCAM_API_KEY` | none | YouCam API key. Server side only. Without it, live mode reports that it is not configured. |
| `DAILY_LIVE_LIMIT` | `20` | Paid analyses per day across all users. |
| `PER_IP_LIVE_LIMIT` | `4` | Paid analyses per day per IP. |

In local development on Windows, if the dev server process was started before `YOUCAM_API_KEY` was added to the user environment, the server reads it from `HKCU\Environment`. This fallback is disabled in production. The key is never logged, returned to the browser or written to disk.

## What's in the app

- **Cases**: real results from the developer's own photos.
  - Same light, nothing changed: within noise.
  - Different room and light, ceiling light to window: blocked (backlight, brightness, colour).
  - Different room and light, ceiling light to desk spot: raw moisture moved past the noise floor, still blocked by the capture check.
  - Same file sent twice: identical scores, within noise.
  - Virtual foundation (positive control): the file sent to YouCam virtual foundation against the try-on output, with `product_category: "foundation"`. The capture check passes. Radiance is allowed as an appearance claim (with the product on). Moisture and wrinkle are blocked by claim type, because foundation is makeup. Pore stays inside the noise floor. This is a simulated product effect, not treated skin, and the after photo differs in more than the face: the try-on also brightened the background and went through PNG to JPEG. See `docs/positive-control-2026-10-13.md`.
  - None of these cases changes only the lamp: the ceiling-light photos were taken in another room with different framing. When a same-spot pair where only the lamp changes is added (`photos/session4/`, see Data), it becomes the first case and the hero.
- **How it decides**: the noise table and the capture calibration, computed from the shipped data.
- **Try your own photos**: upload before and after. The capture check runs first and is free. Skin analysis runs only after the user agrees to the consent note (or confirms when conditions differ). "Try with sample photos" runs the free check on two demo photos and shows their real YouCam responses, cached from 2026-10-13 in `public/demo/youcam/` (signed mask URLs removed), so no credits are spent.
- **For brands**: `POST /api/v1/claim-check` takes the YouCam scores a brand already has, both photos and an optional `product_category`, and returns per-metric verdicts. It makes no YouCam call.

## How it decides

Checks run in order; the first that applies sets the verdict for each metric.

1. **Same file**: equal SHA-256 means nothing changed (`within-noise`).
2. **Claim type**: when `product_category` is given and the policy says that category may not claim this metric (`blocked-claim-type`).
3. **Capture conditions**: any failed check blocks every metric (`blocked-conditions`).
4. **Noise floor**: `within-noise` if |Δraw| ≤ MDC95.
5. **Display change**: `no-visible-change` if |Δraw| > MDC95 but |Δui| < 1. The badge reports the ui change, so a badge reading 0% has nothing to claim.
6. Otherwise `claimable`: |Δraw| > MDC95 and |Δui| ≥ 1. For a category whose claim on this metric is "appearance", the response adds `badge_label: "Appearance with product on"`.

The noise test runs on `raw_score` because ui is a compressed display scale and raw is where movement shows. The badge reports the `ui_score` change, so the display score must move too. Example: a raw wrinkle change of +0.36 against a floor of 0.17 with ui staying at 97 is `no-visible-change` (`tests/noise.test.ts`).

### Claim type policy

`lib/claim-policy.ts`. Which metrics a product category may make claims about. This is a configurable policy that a brand's compliance team would edit, not a regulation.

| Category | Moisture | Pore | Wrinkle | Radiance |
|---|---|---|---|---|
| moisturizer | skin | no | no | skin |
| serum | skin | skin | skin | skin |
| foundation (makeup) | no | appearance | no | appearance |
| cleanser | no | skin | no | no |
| sunscreen | no | no | no | no |

"Skin" is a claim about the skin after use. "Appearance" is a claim about how the skin looks while the product is on, and the badge must say so. Without `product_category` the check is skipped, which is how the lighting cases run.

### Calibrated on these photos only

The noise floor and the four capture limits were set by looking at the same 15 photos they are tested on: one face, one phone, one day. So the pair counts below are an in-sample consistency check, not an accuracy figure. It shows the limits separate these photos, not that they generalize.

Held-out check: pending (new photos). `npm run calibrate` looks for `photos/session4/<setup>/*.jpg`, one folder per lighting setup, and reports the same-setup pass rate and the different-setup block rate on those photos separately from the in-sample numbers. Folders whose name starts with `backlit` are expected to block within the folder too.

### Noise floor

SD per metric comes from the six session1 photos (desk spot, same light). The duplicate submission of IMG_1406 is excluded because it is the same file.

MDC95 = 1.96 × √2 × SD. Each photo carries its own retake error, so the difference of two photos has SD √2 × SD; a change beyond 1.96 of those happens by chance under 5% of the time.

| Metric | SD (raw) | MDC95 (raw) |
|---|---|---|
| Moisture | 1.85 | 5.14 |
| Pore | 1.03 | 2.87 |
| Wrinkle | 0.06 | 0.17 |
| Radiance | 1.22 | 3.38 |

`data/noise-model.json` is generated by `npm run data:noise` from `data/scores.json`. A test checks that the shipped file matches a fresh computation.

### Capture conditions

Measured with `sharp` on the uploaded bytes, resized to fit 360 px. The face region is a fixed central box (x 32 to 68%, y 32 to 62%) and the background is the left and right strips beside the head (outer 12%, y 15 to 75%). There is no face detection, so a selfie needs to be roughly centred.

We tested real face detection offline (`@vladmandic/face-api` with the TensorFlow.js WASM backend, SSD MobileNet). It found exactly one face in all 17 demo images. The fixed box sat inside the detected face left to right in every image, but its top edge reaches above the detector's box: forehead in most photos, the hairline in the window photos. We kept the fixed box: the detector adds about 300 MB of packages and 0.2 to 0.5 s per cold start, and switching would change every stored measurement and limit. A version for real users should place the box relative to a detected face and reject photos with no face.

Columns, ranges and the backlight note below are generated by `calibrationMarkdown()` in `lib/calibration.ts`; the page renders the same rows and a test checks this table matches.

| Check | Limit | Same spot and light, largest | Different room and light, range |
|---|---|---|---|
| Face brightness | ±10.0% | 7.5% | 5.0% to 30.8% |
| Face vs background | ±0.10 | 0.028 | 0.041 to 0.422 |
| Backlight | 15.0% max | 0.2% | 0.0% to 64.0%; 56.1% to 64.0% when one photo has the window behind the head |
| Light colour | ±2.0% | 1.1% | 2.6% to 10.3% |

Each check: face brightness is the relative change of mean face luma; face vs background is the change of the face/background luma ratio; backlight is the share of background pixels with luma at least 235 in either photo; light colour is the relative change of face R/B.

No single check catches every change. Of the 210 ordered photo pairs, the 42 taken at the same spot under the same light (30 desk spot, 12 ceiling light) all pass, and the 168 that cross setups or include a backlit window photo are all blocked. "Same spot and light" means the desk-spot session and the ceiling-light session, each compared within itself. The window session is excluded from that group because every window photo is backlit, so pairs inside it are blocked by design. `npm run calibrate` prints the full table and exits non-zero if any of those expectations break; the tests assert the same thing. These counts are in-sample; see above.

These limits come from one face, one phone and three setups. A brand would recalibrate with retakes from its own users and devices.

## Request protection

Every route that decodes images (`/api/conditions`, `/api/analyze`, `/api/v1/claim-check`) has:

- A per-IP rate limit: 20, 6 and 30 requests per minute, answering 429 with `Retry-After`.
- A body cap checked on `Content-Length` and again while streaming: 21 MB for the two-photo forms, 12 MB for the JSON route.
- Content checks: JPEG or PNG by magic bytes, at most 40 megapixels before decoding. The JSON route also requires `application/json`, strict base64, photos up to 4 MB, scores between 0 and 100, and a known `product_category`.

The limits are in server memory per instance, like the credit caps below. The IP comes from `x-forwarded-for`, which Vercel sets; behind another proxy, make sure it is overwritten there.

## Credit protection (live mode)

- Capture check first; it costs nothing. The paid route rejects mismatched photos unless the user confirms.
- Results are cached by SHA-256 of the uploaded bytes for 24 hours, so the same photo is analyzed once.
- Daily caps: `DAILY_LIVE_LIMIT` (default 20) across everyone, `PER_IP_LIVE_LIMIT` (default 4) per IP. Paid calls are reserved before the request goes out, so parallel requests can't overshoot. When a cap is hit, the API says so and points to the demo cases.
- Input validation: JPG or PNG by content sniffing, under 10 MB, short side at least 480 px, re-encoded to JPEG with the long side at most 2560 px and metadata stripped before upload. The browser also downscales before sending.
- Counters and cache live in server memory. On a serverless host each instance keeps its own, so the caps apply per instance and reset on cold start. For a public deployment with more traffic, move them to a shared store such as Vercel KV.

## Data

- `data/scores.json`: compact scores and capture stats for the 15 photos plus the duplicate submission.
- `public/demo/youcam/*.json`: the raw YouCam responses for the demo photos (`scripts/export-cached.ts`), with the expired signed mask URLs removed.
- New photos go in `photos/session4/<setup>/*.jpg`. `npm run calibrate` uses them as the held-out check. With their YouCam results in `results/s4/<setup>/*.json`, `npm run data:import` stores them under `heldOut` (never in `photos`), and a `photos/session4/lamp-only.json` file (`{ "beforeId", "afterId", "beforeNote", "afterNote" }`) names the same-spot pair where only the lamp changed. That pair becomes the headline case.
- `public/demo/*.jpg`: the photos downscaled to 720 px on the long side, plus the virtual try-on output used by the positive control.
- `data/scores.json` keeps the try-on result under `simulated` and its matched baseline (IMG_1407 resized to 1440 x 1920, the exact try-on input) under `baselines`, separate from `photos`, so neither enters the noise model or the capture calibration.
- These are the developer's own photos, published with his consent. Raw API output (`results/`) and full-size photos (`photos/`) stay local and are gitignored. `npm run data:import` rebuilds the committed data from them.

## Layout

```
app/                 Next.js App Router page and API routes
  api/conditions     free capture check
  api/analyze        capture check + YouCam skin analysis (paid, capped, cached)
  api/v1/claim-check brand-facing check on scores the brand already has
components/          UI (case explorer, result panel, noise ruler, live mode)
lib/                 noise model, capture conditions, measurement, demo cases
lib/server/          YouCam client, key loading, credit guard, image validation
scripts/             data import, noise model, calibration (TS) and the original Python test scripts
tests/               vitest
docs/                measurement notes
```

## License

MIT. Scores come from the YouCam skin analysis API by Perfect Corp. This is an independent hackathon project and is not affiliated with Perfect Corp.
