# Positive control: YouCam virtual foundation (2026-10-13)

The other demo cases show Claim Guard blocking badges. This one checks that it lets a real change through.

## Why virtual foundation

We needed a visible change to the face with the light held fixed. Real skincare takes weeks and the light would drift between sessions. Editing the same photo keeps every capture condition identical except the face.

Options from `GET /s2s/v2.0/credit/feature-cost`:

| Feature | Units | Fit |
|---|---|---|
| AI Makeup Virtual Try-On, foundation | 1 | Coverage evens out texture (pore), glow adds sheen (radiance). Cheapest. |
| AI Look Virtual Try-On | 2 | Full looks add lips and eyes that skin analysis ignores. |
| Skin Simulation | 4 | Closer to "skin improved", but 4x the cost. |

Foundation was the cheapest effect likely to move pore and radiance.

## What was run

1. Source: `IMG_1407` from session1 (same spot, same light). VTO rejects images above 1920 x 1920 px, so the original (1920 x 2560) was resized to 1440 x 1920 before upload.
2. Makeup VTO, foundation: color `#A87C66` (a shade near the face average), colorIntensity 25, glowIntensity 60, coverageIntensity 80. 1 unit. Output 1438 x 1920 PNG, converted to JPEG (quality 95) for analysis.
3. SD skin analysis on the output, moisture, pore, wrinkle, radiance. 9 units.

Total 10 units. One attempt was enough, so no second setting was tried.

## Result

Before is the existing session1 analysis of the untouched `IMG_1407`.

| Metric | Before ui / raw | After ui / raw | Δraw | MDC95 | Verdict |
|---|---|---|---|---|---|
| Moisture | 76 / 66.77 | 81 / 80.56 | +13.80 | 5.14 | claimable |
| Pore | 73 / 62.43 | 71 / 58.80 | −3.63 | 2.87 | claimable (score went down) |
| Wrinkle | 97 / 98.70 | 97 / 99.09 | +0.39 | 0.17 | claimable on raw, ui unchanged |
| Radiance | 82 / 83.19 | 91 / 94.54 | +11.35 | 3.38 | claimable |

Capture check: all four pass.

| Check | Before | After | Limit |
|---|---|---|---|
| Face brightness | 109.7 | 118.9 (+8.4%) | 10% |
| Face vs background | 0.514 | 0.530 | ±0.10 |
| Backlight | 0% | 5.9% | 15% |
| Light colour (R/B) | 1.601 | 1.619 (+1.1%) | 2% |

## Caveats

- This is a simulated product effect, not treated skin. The UI says so on the after photo.
- The VTO brightened the whole frame, background included (background luma 213 to 224). Face brightness rose 8.4%, close to the 10% limit. A stronger glow setting would likely have been blocked as a light change. That is the check doing its job: from pixels alone it cannot tell makeup glow from a brighter lamp.
- The pore score dropped. Foundation smoothing did not read as smaller pores to the analyzer. Claim Guard tests size of change, not direction, so it would allow a "Pore −3%" badge, which is accurate.
- Moisture moved more than radiance on raw, although foundation is not a moisturizer. We did not test why.
- The before scores come from the original 1920 x 2560 file; the after went through a resize, the VTO and a PNG to JPEG step. We did not spend 9 more units to analyze the resized untouched photo alone, so a small part of the change could come from the resize.

Files: `photos/vto/` and `results/vto/` (local, gitignored). `scripts/vto.py` reproduces the VTO step; `npm run data:import` rebuilds the committed data.
