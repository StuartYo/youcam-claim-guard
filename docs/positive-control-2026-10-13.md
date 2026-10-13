# Positive control: YouCam virtual foundation (2026-10-13)

The other demo cases show Claim Guard blocking badges. This one checks that it lets a real change through, and that it only lets through claims the product can make.

## Why virtual foundation

We needed a visible change to the face with the light held fixed. Real skincare takes weeks and the light would drift between sessions. Editing one photo keeps the lamp and the camera fixed. It does not keep everything else identical: see Caveats.

Options from `GET /s2s/v2.0/credit/feature-cost`:

| Feature | Units | Fit |
|---|---|---|
| AI Makeup Virtual Try-On, foundation | 1 | Coverage evens out texture (pore), glow adds sheen (radiance). Cheapest. |
| AI Look Virtual Try-On | 2 | Full looks add lips and eyes that skin analysis ignores. |
| Skin Simulation | 4 | Closer to "skin improved", but 4x the cost. |

Foundation was the cheapest effect likely to move pore and radiance.

## What was run

1. Source: `IMG_1407` from session1 (desk spot, same light). VTO rejects images above 1920 x 1920 px, so the original (1920 x 2560) was resized to 1440 x 1920 before upload: `photos/vto/IMG_1407_1920.jpg`.
2. Makeup VTO, foundation: color `#A87C66` (a shade near the face average), colorIntensity 25, glowIntensity 60, coverageIntensity 80. 1 unit. Output 1438 x 1920 PNG, converted to JPEG (quality 95) for analysis.
3. SD skin analysis on the output, moisture, pore, wrinkle, radiance. 9 units.
4. SD skin analysis on `IMG_1407_1920.jpg`, the exact file sent to the VTO, same four concerns. 9 units. This is the "before" in the app, so the resize is the same on both sides. The after side also went through the try-on rendering and a PNG to JPEG step.

Total 19 units. One VTO attempt was enough, so no second setting was tried.

## Result

Before is the resized untouched file from step 4. After is the VTO output from step 3.

| Metric | Before ui / raw | After ui / raw | Δraw | MDC95 | Δui | Verdict |
|---|---|---|---|---|---|---|
| Moisture | 76 / 66.84 | 81 / 80.56 | +13.72 | 5.14 | +5 | claimable |
| Pore | 73 / 61.63 | 71 / 58.80 | −2.83 | 2.87 | −2 | within noise |
| Wrinkle | 97 / 98.73 | 97 / 99.09 | +0.36 | 0.17 | 0 | no visible change |
| Radiance | 82 / 83.09 | 91 / 94.54 | +11.45 | 3.38 | +9 | claimable |

Capture check: all four pass.

| Check | Before | After | Limit |
|---|---|---|---|
| Face brightness | 109.6 | 118.9 (+8.5%) | 10% |
| Face vs background | 0.514 | 0.530 | ±0.10 |
| Backlight | 0% | 5.9% | 15% |
| Light colour (R/B) | 1.602 | 1.619 (+1.1%) | 2% |

### What changed after matching the resize

The first version of this case used the analysis of the original 1920 x 2560 file as "before". That mixed two changes: the resize and the foundation. With the matched baseline:

| Metric | Δraw vs original file | Δraw vs resized file | Verdict then | Verdict now |
|---|---|---|---|---|
| Moisture | +13.80 | +13.72 | claimable | claimable |
| Pore | −3.63 | −2.83 | claimable | within noise |
| Wrinkle | +0.39 | +0.36 | claimable on raw | no visible change |
| Radiance | +11.35 | +11.45 | claimable | claimable |

Resizing alone (original vs resized, no foundation) moved raw scores by moisture +0.08, pore −0.81, wrinkle +0.03, radiance −0.10. All are inside the noise floor, but the pore part was enough to push the earlier pore result just past it. The pore claim is withdrawn: −2.83 is inside the ±2.87 floor.

Wrinkle moved past its raw floor (+0.36 against 0.17) while the display score stayed at 97. The badge shows the display score, so a "Wrinkle 0%" badge has nothing to claim. Claim Guard now requires both |Δraw| > MDC95 and |Δui| ≥ 1.

## Claim type: foundation is makeup

The table above is the verdict without a product category. Foundation is makeup, so "Moisture +7%" would itself be a misleading claim: foundation does not add moisture. Since 2026-10-13 the case runs with `product_category: "foundation"` and the claim policy in `lib/claim-policy.ts` (a configurable policy, not a regulation). Foundation may make appearance claims on radiance and pore only.

| Metric | Verdict with product_category foundation | Why |
|---|---|---|
| Moisture | blocked-claim-type | Foundation is makeup. A moisture claim needs a product such as a moisturizer or serum. |
| Pore | within noise | Allowed as an appearance claim, but −2.83 is inside the ±2.87 floor. |
| Wrinkle | blocked-claim-type | Foundation is makeup. A wrinkle claim needs a product such as a serum. |
| Radiance | claimable, appearance | Badge "Radiance +11%" with the label "Appearance with product on". |

## Noise floor update (2026-10-13 evening)

The tables above use the first noise floor, from session1 alone. Held-out retakes showed that floor was too tight, and the app now uses an SD pooled over five sets of retakes (`docs/held-out-2026-10-13.md`). With the pooled floor (moisture 7.10, pore 8.93, wrinkle 1.51, radiance 3.83):

| Metric | Δraw | Pooled MDC95 | Verdict without category | Verdict as foundation |
|---|---|---|---|---|
| Moisture | +13.72 | 7.10 | claimable | blocked-claim-type |
| Pore | −2.83 | 8.93 | within noise | within noise |
| Wrinkle | +0.36 | 1.51 | within noise (was no visible change) | blocked-claim-type |
| Radiance | +11.45 | 3.83 | claimable | claimable, appearance |

Only the wrinkle verdict without a category changed. The badge the app would show is the same: "Radiance +11%" with the label "Appearance with product on".

## Caveats

- This is a simulated product effect, not treated skin. The UI says so on the after photo.
- The after photo differs in more than the face. The VTO brightened the whole frame, background included (background luma 213 to 224). Face brightness rose 8.5%, close to the 10% limit. A stronger glow setting would likely have been blocked as a light change. That is the check doing its job: from pixels alone it cannot tell makeup glow from a brighter lamp.
- Moisture moved more than radiance on raw, although foundation is not a moisturizer. We did not test why.
- The after photo also went through a PNG to JPEG step (quality 95) that the before did not. We did not measure that step on its own.
- One photo, one effect setting. This shows the gate can open; it says nothing about how often real products clear it.

Files: `photos/vto/` and `results/vto/`, `results/vto_before/` (local, gitignored). `scripts/vto.py` reproduces the VTO step, `scripts/skin.py moisture,pore,wrinkle,radiance vto_before photos/vto/IMG_1407_1920.jpg` the baseline; `npm run data:import` rebuilds the committed data.
