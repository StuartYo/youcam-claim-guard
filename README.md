# Claim Guard

A QA check for beauty apps that show before/after skin scores from the YouCam skin analysis API.

Before the app shows a badge like "Moisture +12%", Claim Guard answers three questions:

1. Is the change larger than what retaking the same photo produces? (noise floor)
2. Were both photos taken under comparable light? (capture conditions)
3. Can this product cause this kind of change? (claim type: foundation can't claim moisture)

If any answer is no, the badge is blocked and the reason is returned.

## Why

We took 15 selfies of the same face on the same day with no skincare in between, under three setups, and ran each through YouCam SD skin analysis (`docs/noise-floor-2026-10-13.md`).

- Same light, nothing changed: `ui_score` moves about ±1, `raw_score` SD is 1 to 2 in that session. Retakes on a later evening spread more (moisture SD up to 3.75), so the noise floor now pools both; see Noise floor.
- Moving to a different room and light (ceiling light in one room, a bright window in another) moved average moisture from ui 73.3 to 80.0 (+9.1%), raw 58.2 to 77.0.
- The same file sent twice returns identical scores. The jitter comes from the photo, not the API.

On a different evening we took 12 more (`docs/held-out-2026-10-13.md`), in one room: four under the ceiling light, four under a desk lamp with the phone re-positioned (lower and tilted up, so the ceiling is in frame), and four under the same lamp about 20 minutes after washing the face and applying a moisturizer.

- Ceiling light to desk lamp in the same room, with the phone re-positioned, moved average moisture from ui 70.8 to 75.3 (+6.4%) and wrinkle from ui 86.5 to 96.3. No skincare in between.
- The real moisturizer moved average moisture from ui 75.3 to 75.0.

A "+9% moisture" claim can be produced by moving to a different room, and "+6%" by switching on a desk lamp.

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
  - Same room, ceiling light to desk lamp (the hero): held-out photos `IMG_1437` and `IMG_1432`. The phone was also re-positioned, so this is not a lamp-only pair. Moisture (raw +12.4, ui 70 to 75) and wrinkle (raw +5.2, ui 86 to 96) move past the noise floor, so a noise check alone would show both badges. The capture check blocks the pair (face 24% darker, face vs background, light colour). The lamp photos were taken a few minutes before the ceiling ones; the case orders them ceiling to lamp, the direction that shows a gain.
  - Same light, nothing changed: within noise.
  - Different room and light, ceiling light to window: blocked (backlight, brightness, colour).
  - Different room and light, ceiling light to desk spot: raw moisture moved past the noise floor, still blocked by the capture check.
  - Same file sent twice: identical scores, within noise.
  - Real moisturizer, same lamp, 20 minutes: held-out `IMG_1432` (before) and `IMG_1442` (after), `product_category: "moisturizer"`. One person, one application, photos about 20 minutes later. No badge. Raw moisture moved +1.0 (ui 75 to 75), inside the floor, so there is no moisture result even before the capture check. Pore rose (raw +10.9) but this policy does not let a moisturizer claim pore; wrinkle is also blocked by claim type. Radiance fell (raw −4.9). The capture check blocked the pair because the face measured 10.1% brighter (limit 10%) under the same lamp, so moisture and radiance show `blocked-conditions`. It says nothing about what the product does over weeks.
  - Virtual foundation (positive control): the file sent to YouCam virtual foundation against the try-on output, with `product_category: "foundation"`. The capture check passes. Radiance is allowed as an appearance claim (with the product on). Moisture and wrinkle are blocked by claim type, because foundation is makeup. Pore stays inside the noise floor. This is a simulated product effect, not treated skin, and the after photo differs in more than the face: the try-on also brightened the background and went through PNG to JPEG. See `docs/positive-control-2026-10-13.md`.
  - Representative photos: each held-out case uses the shot closest to its group mean on the four raw scores (squared differences divided by the pooled SD), chosen on scores only (`representative()` in `lib/noise-groups.ts`). The headline pair is named in `photos/session4/lamp-only.json`, and a test checks it matches that rule. The in-sample cases keep their original pairs.
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

The noise test runs on `raw_score` because ui is a compressed display scale and raw is where movement shows. The badge reports the `ui_score` change, so the display score must move too. Example: a raw wrinkle change just past the floor with ui staying at 97 is `no-visible-change` (`tests/noise.test.ts`). With the pooled floor no demo case lands here; with the old session 1 floor the positive control's wrinkle (+0.36 against 0.17) did.

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

### Calibrated on these photos only, then tested on new ones

The four capture limits were set by looking at the first 15 photos: one face, one phone, one day. The in-sample pair counts below are a consistency check, not an accuracy figure.

### Held-out check

Twelve photos of the same face from a different evening (2026-10-13), not used to set the limits. The limits were not changed after seeing them. `npm run calibrate` prints the full table.

| Setup | What the photos show |
|---|---|
| A | Ceiling light only. Phone held closer: the face is larger in frame and no ceiling is visible. |
| B | Same room, desk lamp instead of the ceiling light. Phone re-positioned lower and tilted up: the ceiling is in frame and the face is smaller. |
| C | Same desk lamp as B, similar framing (a little less ceiling in frame), about 20 minutes after washing the face and applying a moisturizer. |

On 12 held-out photos from a different evening, with the limits frozen: 32 of 36 same-setup pairs pass (88.9%); the 4 failures are all in setup B (desk lamp), on face brightness. 64 of 64 pairs with different light are blocked (100.0%). Between the desk-lamp photos before and after moisturizer (same lamp), only 10 of 32 pairs pass (31.3%); the others fail on light colour in 15, face brightness in 7.

What this shows: the check blocked every pair where the light changed. It also blocked pairs it should have passed. In set B the face got brighter from shot to shot under the same lamp (luma 86 to 100). Between B and C the lamp was the same, but the face measured redder after washing and moisturizer, and the light colour check reads that as warmer light: from pixels alone it cannot tell skin colour from light colour. For a user that means more "retake in the same light" prompts than needed, not a wrong badge.

### Noise floor

Until the held-out photos arrived, the SD came from the six session1 photos alone. The held-out retakes were noisier: under that floor, 6 of 18 same-setup held-out pairs moved moisture past it and 10 of 18 moved wrinkle past it, where about 1 in 20 is expected. The session1 floor was too tight.

The SD is now pooled within five sets of retakes, each at one spot under one light with nothing changed in between: session1 (desk spot, 6), session3 (ceiling light, other room, 4), and held-out A, B and C (4 each). Pooled SD = √(Σ(nᵢ − 1)·SDᵢ² / Σ(nᵢ − 1)), so each set keeps its own mean and a light change between sets never counts as noise. The window session is left out because every photo in it is backlit and the capture check blocks those pairs anyway. The duplicate submission of IMG_1406 and the try-on photos are left out because they are not retakes.

MDC95 = 1.96 × √2 × SD. Each photo carries its own retake error, so the difference of two photos has SD √2 × SD; a change beyond 1.96 of those happens by chance under 5% of the time.

| Metric | SD s1 | SD s3 | SD s4A | SD s4B | SD s4C | Pooled SD | MDC95 pooled (used) | MDC95 session 1 only (before) |
|---|---|---|---|---|---|---|---|---|
| Moisture | 1.85 | 1.19 | 3.75 | 3.31 | 2.25 | 2.56 | 7.10 | 5.14 |
| Pore | 1.03 | 4.37 | 6.02 | 1.04 | 0.71 | 3.22 | 8.93 | 2.87 |
| Wrinkle | 0.06 | 0.34 | 1.23 | 0.18 | 0.08 | 0.55 | 1.51 | 0.17 |
| Radiance | 1.22 | 0.55 | 1.41 | 1.62 | 1.85 | 1.38 | 3.83 | 3.38 |

With the pooled floor, 3, 3, 3 and 0 of the 18 held-out pairs still move past it for moisture, pore, wrinkle and radiance. Those photos helped set the pooled floor, so that count is in-sample, and the floor may still be too tight. Pore is the widest because of one shot in set A (IMG_1436, raw 68.7 against about 57 for the other three) and the ceiling-light session.

What changed in the cases: the positive control's wrinkle (+0.36 raw) moved from `no-visible-change` to `within-noise`; every other verdict stayed the same, though a few blocked metrics no longer cross the floor. Radiance in the positive control (+11.45 raw against 3.83) is still claimable.

`data/noise-model.json` is generated by `npm run data:noise` from `data/scores.json` (groups in `lib/noise-groups.ts`) and keeps the session1-only model next to the pooled one. A test checks that the shipped file matches a fresh computation.

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

- `data/scores.json`: compact scores and capture stats for the 15 photos, the duplicate submission and the 12 held-out photos.
- `public/demo/youcam/*.json`: the raw YouCam responses for the demo photos (`scripts/export-cached.ts`), with the expired signed mask URLs removed.
- Held-out photos are in `photos/session4/{A,B,C}/*.jpg` with YouCam results in `results/s4A/`, `results/s4B/`, `results/s4C/` (or `results/s4/<setup>/`). `npm run calibrate` uses them as the held-out check. `npm run data:import` stores them under `heldOut` (never in `photos`, so they stay out of the in-sample calibration; they do join the pooled noise floor). Setup descriptions and which setups share a light are in `lib/heldout.ts`. `photos/session4/lamp-only.json` (`{ "beforeId", "afterId", "beforeNote", "afterNote", "title", "summary" }`) names the headline pair and carries its label, so the label says exactly what changed.
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
