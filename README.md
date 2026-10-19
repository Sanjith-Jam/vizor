# Vizor

Connected AR helmet prototype: navigation, shared pothole intelligence and a real Banana Pi photo-inference demo. React/Vite website, Expo Android companion, Supabase backend, Python edge inference and ESP32 firmware share the same contracts.

## Start here

- [Setup](docs/SETUP.md) — local clients, Supabase, restricted Google keys and Gemini.
- [Live demo](docs/LIVE_DEMO.md) — photo → Banana Pi → database → map → app.
- [Hardware](docs/HARDWARE.md) — Banana Pi, Wi-Fi changes, SIM7600X and remaining wiring checks.
- [Architecture](docs/ARCHITECTURE.md) — data ownership, queue and device protocols.
- [Verification and remaining work](docs/VERIFICATION.md).
- [Model evaluation](docs/MODEL_EVALUATION.md) and [pinned assets/licenses](vision-ai/model_assets/README.md).

## Project layout

| Directory | Purpose |
| --- | --- |
| `website/` | Product site, rider dashboard and photo lab |
| `mobile-app/` | Android companion and browser preview |
| `shared/` | Contracts, validation, maps and demo data |
| `supabase/` | Ordered migrations and authenticated API |
| `vision-ai/` | Pi worker, camera/GNSS pipeline and pinned models |
| `firmware/` | ESP32-S3 BLE/UART and OLED firmware |
| `hardware/` | Bill of materials, wiring and optics notes |
| `scripts/` | Verification and optional Android build commands |
| `docs/` | Current setup and acceptance documentation |

`output/` contains generated models/builds/evidence locally and is excluded from Git. `.tools` is ignored private setup state on the original machine; it is not required for a fresh clone. Dependencies, SDKs, credentials and old build outputs are not repository content.

## Development

Requires Node.js 22.13+ and Python 3.11+; the actual Pi uses Python 3.13. Install each client separately:

```sh
npm --prefix website ci
npm --prefix mobile-app ci
npm run website
# Another terminal:
npm --prefix mobile-app run web -- --port 8083
```

Copy the example environments only when setting up a new machine; preserve configured local files. Live accounts/maps require the services in [Setup](docs/SETUP.md). Browser BLE is unavailable; native BLE requires a development build. No new APK is part of the current delivery.

```sh
npm run check
python -m unittest discover -s vision-ai -p 'test_*.py'
python -m unittest discover -s vision-ai/model_assets -p 'test_*.py'
pio run -d firmware
```

Python logic tests use lightweight `pyyaml` and `scikit-learn`; full ML dependencies are unnecessary for those tests. Real inference uses the separate runtime in `vision-ai/deploy/requirements.txt`.

## Status and attribution

Real Pi photo inference, cloud queue recovery, private observation storage, browser maps/routing and website/app-preview synchronization have passed. Native phone runtime, ESP32-CAM, moving GNSS/IMU and physical OLED acceptance remain pending. Battery is unavailable without measurements. This is a supervised prototype, not a road-safety certification.

Based on [Kettydee/AI-Assisted-AR-Helmet-Navigation-System](https://github.com/Kettydee/AI-Assisted-AR-Helmet-Navigation-System); original authors and MIT notice are retained in [LICENSE](LICENSE). Model/framework licenses are AGPL-3.0; RDD2022 images are CC BY-SA 4.0. Those assets are not relicensed as MIT. Checkpoint hashes, source attribution and full license texts are retained under `vision-ai/model_assets/`.
