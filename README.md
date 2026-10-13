# Claim Guard

A QA check for beauty apps that show before/after skin scores from the YouCam skin analysis API.

Before the app shows a badge like "Moisture +12%", Claim Guard answers two questions:

1. Is the change larger than what retaking the same photo produces? (noise floor)
2. Were both photos taken under comparable light? (capture conditions)

If either answer is no, the badge is blocked and the reason is returned.

## Why

We took 15 selfies of the same face on the same day with no skincare in between, under three setups, and ran each through YouCam SD skin analysis (`docs/noise-floor-2026-10-13.md`).

- Same light, nothing changed: `ui_score` moves about ±1, `raw_score` SD is 1 to 2.
- Changing only the lamp (ceiling light to window) moved average moisture from ui 73.3 to 80.0 (+9.1%), raw 58.2 to 77.0.
- The same file sent twice returns identical scores. The jitter comes from the photo, not the API.

A "+9% moisture" claim can be produced by moving to a different room.

Numbers in this README, the docs and the page come from `data/scores.json` with one rounding rule (half up, `fix()` in `lib/summary.ts`). `tests/docs-consistency.test.ts` fails if a quoted number drifts from the data.

## Why brands need this

Before/after skin scores are a claim about a product. The rules below already ask brands to back such claims with evidence. A score change that a different lamp can produce is weak evidence. Claim Guard gives the brand's compliance or marketing review team a logged reason for every badge it shows or holds back, and gives Perfect Corp a trust feature to offer its brand clients on top of the skin analysis API.

| Market | Rule | What it asks for |
|---|---|---|
| EU | [Commission Regulation (EU) No 655/2013](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32013R0655), common criteria for cosmetic claims, adopted under Article 20 of Regulation (EC) No 1223/2009 | Annex point 3, evidential support: claims must be supported by adequate and verifiable evidence, from methods that are valid, reliable and reproducible. Point 4: performance must not be presented beyond the available evidence. |
| US | [FTC Policy Statement Regarding Advertising Substantiation](https://www.ftc.gov/legal-library/browse/ftc-policy-statement-regarding-advertising-substantiation) (1984), with FTC Act Sections 5 and 12 (15 U.S.C. 45, 52), which cover false advertising of cosmetics | Advertisers need a reasonable basis for objective claims before the ad runs. |
| Taiwan | [Cosmetic Hygiene and Safety Act](https://law.moj.gov.tw/ENG/LawClass/LawAll.aspx?pcode=L0030013), Article 10, penalties in Article 20 | Labels, promotion and advertising must not be false or exaggerated. Breaking Article 10(1) carries a fine of NT$40,000 to 200,000. |
| Taiwan | [Regulations Governing Criteria for the Label, Promotion, Advertisement with Deception, Exaggeration, or Medical efficacy of Cosmetic Products](https://law.moj.gov.tw/ENG/LawClass/LawAll.aspx?pcode=L0030099), Article 3 | A claim with no evidence, or evidence insufficient to support it, counts as false or exaggerated. |

Claim Guard does not make a claim compliant. It catches one common way a before/after number misleads: comparing photos taken under different light, or reading retake noise as a result.

## Run it

Requires Node 20 or later.

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # vitest
npm run build
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

- **Cases**: real results from the developer's own photos. Same light with nothing changed (within noise), ceiling light to window (blocked: backlight, brightness, colour), ceiling light to desk spot (raw moisture moved past the noise floor, still blocked by the capture check), the same file twice (identical), and a positive control: the exact file sent to YouCam virtual foundation against the try-on output (capture check passes, moisture and radiance are claimable, pore stays inside the noise floor, wrinkle moves on raw but not on the display score). The positive control is a simulated product effect, not treated skin; see `docs/positive-control-2026-10-13.md`.
- **How it decides**: the noise table and the capture calibration, computed from the shipped data.
- **Try your own photos**: upload before and after. The capture check runs first and is free. Skin analysis runs only after the user agrees to the consent note (or confirms when conditions differ).
- **For brands**: `POST /api/v1/claim-check` takes the YouCam scores a brand already has plus both photos and returns per-metric verdicts. It makes no YouCam call.

## How it decides

Checks run in order; the first that applies sets the verdict for each metric.

1. **Same file**: equal SHA-256 means nothing changed (`within-noise`).
2. **Capture conditions**: any failed check blocks every metric (`blocked-conditions`).
3. **Noise floor**: `within-noise` if |Δraw| ≤ MDC95.
4. **Display change**: `no-visible-change` if |Δraw| > MDC95 but |Δui| < 1. The badge reports the ui change, so a badge reading 0% has nothing to claim.
5. Otherwise `claimable`: |Δraw| > MDC95 and |Δui| ≥ 1.

The noise test runs on `raw_score` because ui is a compressed display scale and raw is where movement shows. The badge reports the `ui_score` change, so the display score must move too. In the positive control, wrinkle went from raw 98.73 to 99.09 (+0.36 against a floor of 0.17) while ui stayed at 97, so it is held back.

### Calibrated on these photos only

The noise floor and the four capture limits were set by looking at the same 15 photos they are tested on: one face, one phone, one day. So "30 of 30 same-light pairs pass, 168 of 168 changed-light pairs blocked" is an in-sample consistency check, not an accuracy figure. It shows the limits separate these photos, not that they generalize.

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

Measured with `sharp` on the photo resized to fit 360 px. No face detection: the face region is a fixed central box (x 32–68%, y 32–62%), the background is the left and right strips beside the head (outer 12%, y 15–75%).

| Check | Limit | Same light, largest seen | Different light |
|---|---|---|---|
| Face brightness (relative change of mean luma) | 10% | 7.5% | 5.0% to 30.8% |
| Face vs background (change of face/background luma ratio) | 0.10 | 0.028 | 0.041 to 0.422 |
| Backlight (share of background pixels with luma ≥ 235, either photo) | 15% | 0.2% | 56% to 64% with the window behind |
| Light colour (relative change of face R/B) | 2% | 0.8% | 2.6% to 10.3% |

No single check catches every lamp change. Together they pass all 30 same-light pairs and block all 168 pairs that involve a different light or a backlit photo. These are ordered pairs: 15 photos give 210, minus the 30 desk-spot pairs and the 12 ceiling-only pairs, which pass and are not used to set the limits. `npm run calibrate` prints the full table and exits non-zero if any of those expectations break; the tests assert the same thing. These counts are in-sample; see above.

These limits come from one face, one phone and three lighting setups. A brand would recalibrate with retakes from its own users and devices.

## Credit protection (live mode)

- Capture check first; it costs nothing. The paid route rejects mismatched photos unless the user confirms.
- Results are cached by SHA-256 of the uploaded bytes for 24 hours, so the same photo is analyzed once.
- Daily caps: `DAILY_LIVE_LIMIT` (default 20) across everyone, `PER_IP_LIVE_LIMIT` (default 4) per IP. Paid calls are reserved before the request goes out, so parallel requests can't overshoot. When a cap is hit, the API says so and points to the demo cases.
- Input validation: JPG or PNG by content sniffing, under 10 MB, short side at least 480 px, re-encoded to JPEG with the long side at most 2560 px and metadata stripped before upload. The browser also downscales before sending.
- Counters and cache live in server memory. On a serverless host each instance keeps its own, so the caps apply per instance and reset on cold start. For a public deployment with more traffic, move them to a shared store such as Vercel KV.

## Data

- `data/scores.json`: compact scores and capture stats for the 15 photos plus the duplicate submission.
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
