# Noise floor + lighting test (2026-10-13)

15 selfies of the same face, same day, no skincare change. SD Skin Analysis, 4 concerns (moisture, pore, wrinkle, radiance), 9 units each. 16 calls = 144 units. Balance after: 856 + 40 bonus.

- session1: 6 shots, same spot, same light
- session2: 5 shots, window daylight (window behind, face backlit)
- session3: 4 shots, ceiling light

| metric | s1 same light | s2 window | s3 ceiling |
|---|---|---|---|
| moisture | ui 75.7±0.5, raw 65.1±1.9 | ui 80.0±0.7, raw 77.0±2.1 | ui 73.2±0.5, raw 58.2±1.2 |
| pore | ui 72.3±0.5, raw 61.1±1.0 | ui 73.0±4.0, raw 62.5±8.9 | ui 75.8±1.7, raw 68.6±4.4 |
| radiance | ui 81.3±0.5, raw 81.5±1.2 | ui 83.2±0.4, raw 86.3±0.8 | ui 84.2±0.5, raw 88.3±0.5 |
| wrinkle | ui 97.0±0.0, raw 98.8±0.1 | ui 95.6±0.5, raw 98.2±0.1 | ui 94.8±1.0, raw 97.8±0.3 |

Findings
1. Same file submitted twice returns identical scores (deterministic). Jitter comes from the photo, not the API.
2. Same light, nothing changed: ui moves ±1, raw SD 1–2. Minimum detectable change (95%, 2.77×SD) on raw: moisture ≈ 5.1, pore ≈ 2.9, radiance ≈ 3.4.
3. Light alone moves moisture from ui 73.2 (ceiling) to 80.0 (window): +9.3%. Raw: 58.2 → 77.0, +32%. A "moisture +9%" before/after claim can be produced by changing the room.
4. Pore is unstable under backlight (raw SD 8.9). Gate backlit photos.
5. ui_score is a compressed display scale; raw_score is where the movement shows. Claim Guard should test on raw and report in ui.
