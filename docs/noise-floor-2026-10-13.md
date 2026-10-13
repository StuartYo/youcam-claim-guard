# Noise floor + lighting test (2026-10-13)

15 selfies of the same face, same day, no skincare change. SD Skin Analysis, 4 concerns (moisture, pore, wrinkle, radiance), 9 units each. 16 calls = 144 units. Balance after: 856 + 40 bonus.

- session1: 6 shots, desk spot, same light
- session2: 5 shots, window daylight (window behind, face backlit), same room as session1
- session3: 4 shots, ceiling light in another room, with different framing (air conditioner and wardrobe behind)

Means and SDs are rounded half up to one decimal (`fix()` in `lib/summary.ts`, the same rule the app uses).

| metric | s1 same light | s2 window | s3 ceiling |
|---|---|---|---|
| moisture | ui 75.7±0.5, raw 65.1±1.9 | ui 80.0±0.7, raw 77.0±2.1 | ui 73.3±0.5, raw 58.2±1.2 |
| pore | ui 72.3±0.5, raw 61.1±1.0 | ui 73.0±4.0, raw 62.5±8.9 | ui 75.8±1.7, raw 68.6±4.4 |
| radiance | ui 81.3±0.5, raw 81.5±1.2 | ui 83.2±0.4, raw 86.3±0.8 | ui 84.3±0.5, raw 88.3±0.5 |
| wrinkle | ui 97.0±0.0, raw 98.8±0.1 | ui 95.6±0.5, raw 98.2±0.1 | ui 94.8±1.0, raw 97.8±0.3 |

Findings
1. Same file submitted twice returns identical scores (deterministic). Jitter comes from the photo, not the API.
2. Same light, nothing changed: ui moves ±1, raw SD 1–2. Minimum detectable change (95%, 2.77 × SD) on raw: moisture ≈ 5.1, pore ≈ 2.9, radiance ≈ 3.4. Superseded the same evening: held-out retakes were noisier, and the app now uses an SD pooled over five sets of retakes (moisture 7.1, pore 8.9, wrinkle 1.5, radiance 3.8). See "Update" below.
3. A different room and light moves moisture from ui 73.3 (ceiling) to 80.0 (window): +9.2% (from the unrounded means, rounded once). Raw: 58.2 → 77.0, +32%. A "moisture +9%" before/after claim can be produced by changing the room. This is not a lamp-only test: room, framing and light all changed. The later same-room test (`docs/held-out-2026-10-13.md`) also moved the phone, so it is not lamp-only either.
4. Pore is unstable under backlight (raw SD 8.9). Gate backlit photos.
5. ui_score is a compressed display scale; raw_score is where the movement shows. Claim Guard should test on raw and report in ui.

## Update (2026-10-13 evening): held-out photos and the pooled noise floor

Twelve more photos on a different evening, in one room: A ceiling light, B desk lamp with the phone re-positioned, C same lamp after a moisturizer. Details and the capture-check results are in `docs/held-out-2026-10-13.md`.

The within-set spread was larger than in session1 (moisture raw SD 3.75 in A against 1.85 in session1). Under the session1 floor, 6 of 18 same-setup held-out pairs moved moisture past it and 10 of 18 moved wrinkle past it, where about 1 in 20 is expected. The app now pools the SD within five sets of retakes (session1, session3, A, B, C); each set keeps its own mean, so the light difference between sets is not counted as noise.

| Metric | SD s1 | SD s3 | SD s4A | SD s4B | SD s4C | Pooled SD | MDC95 pooled (used) | MDC95 session 1 only (before) |
|---|---|---|---|---|---|---|---|---|
| Moisture | 1.85 | 1.19 | 3.75 | 3.31 | 2.25 | 2.56 | 7.10 | 5.14 |
| Pore | 1.03 | 4.37 | 6.02 | 1.04 | 0.71 | 3.22 | 8.93 | 2.87 |
| Wrinkle | 0.06 | 0.34 | 1.23 | 0.18 | 0.08 | 0.55 | 1.51 | 0.17 |
| Radiance | 1.22 | 0.55 | 1.41 | 1.62 | 1.85 | 1.38 | 3.83 | 3.38 |
