# YouCam API notes (verified 2026-10-12)

- Base: `https://yce-api-01.makeupar.com`, header `Authorization: Bearer <YOUCAM_API_KEY>` (no token exchange needed).
- Balance: `GET /s2s/v1.0/client/credit` -> 1000 units (ApiPaygToken), expiry 2027-01-10.
- Costs: `GET /s2s/v2.0/credit/feature-cost` (paginated, `next_token` -> `?starting_token=`).
  - Skin Analysis v2.0/v2.1 SD: 9 (1-4 concerns) / 12 (5-8) / 14 (9-12) / 16 (13-16). HD: 12/16/20/22.
  - Makeup VTO 1, Look VTO 2, Skin Simulation 4 (1-4) / 6 (5-10), Fitzpatrick 10.
- Flow: `POST /s2s/v2.0/file` -> PUT bytes to `requests[0].url` -> `POST /s2s/v2.0/task/skin-analysis {src_file_id, dst_actions, format:"json"}` -> poll `GET .../task/skin-analysis/{task_id}` (running/success/error; units only charged on success; results kept 24h).
- SD dst_actions: wrinkle, droopy_upper_eyelid, droopy_lower_eyelid, firmness, acne, moisture, eye_bag, dark_circle_v2, age_spot, radiance, redness, oiliness, pore, texture, tear_trough, skin_type. Do not mix SD and HD.
- Input: jpg/png < 10MB, SD short side >= 480px, long side <= 2560px; face 60-80% of width, frontal, neutral, even light, forehead visible, no glasses.
