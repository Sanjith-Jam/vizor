# Verification and remaining work

Last accepted: 19 October 2026. This describes the current source and bench demonstration, not a certified riding product.

| Check | Result |
| --- | --- |
| Mobile domain/protocol tests | 81 passed |
| Shared validation/maps/queue contracts | 12 passed |
| Python inference/GNSS/outbox/training-helper tests | 43 passed, including 3 photo worker tests |
| Model integrity/evaluation helpers | 4 passed |
| ESP32-S3 firmware compilation | Passed; firmware was not flashed |
| Mobile TypeScript | Passed |
| Website TypeScript + production build | Passed |
| Expo dependency compatibility and Doctor | Passed; Doctor 21/21 |
| Android native prebuild and JS/Hermes export | Passed; no new APK generated |
| Live Google Maps | Rendered in website and app browser preview |
| Live Places / motorcycle Routes | Five search matches and two actual route alternatives |
| Authenticated Gemini text request | Passed; unknown battery remained unknown |
| Real Banana Pi photo inference | Positive image → annotated result → private observation → map point |
| Cross-client realtime | Website upload appeared in app; app upload appeared on website without manual refresh |
| Queue/ownership checks | 16 assertions passed: RLS, evidence/device isolation, invalid credentials/location, direct RPC validation, cancellation/retry fencing, offline recovery and negative-image isolation |
| Client output secret scan | No server keys, PAT, device token or demo password in website/app exports |

Actual positive Pi jobs measured approximately 538–1481 ms inference on individual stills. A blank image returned zero detections and created no observation/map marker. One positive photo creates one approximate observation even with multiple boxes. Demo mode remains private and never publishes a shared road hazard. Scripted HUD warning distances are labeled and send no hardware command.

Website and app photo screens were exercised at phone width and desktop width, including file selection, invalid-file/coordinate errors, live jobs, native device-select popup, Google map overlays and SQL-backed activity. App browser speech returned its unavailable state and retained the visible warning. Target Android audio is not certified by browser behavior.

The original setup computer retains detailed, ignored reports/builds/screenshots under `output/`; older evidence and recovery material are outside the source tree. A fresh clone reproduces the photo acceptance with `scripts/verify-photo-demo.py` after configuring its services and device. Model diagnostic methodology/results are retained in [MODEL_EVALUATION.md](MODEL_EVALUATION.md); board measurements are in [HARDWARE.md](HARDWARE.md).

The premium static UI audit is not a clean pass: its scanner treated React Native `Button`/`onPress` as actionless controls and also reported existing form-contract gaps. Removed obsolete auth-page copies are no longer part of the source. Runtime tests do not establish full accessibility conformance. Existing dependency advisories need review before public distribution; force-downgrading Expo/React Native was not used as a workaround.

## Repository cleanup acceptance

Current documentation is consolidated into six guides. Unused starter UI, duplicated schema, old packaging/video scripts and the legacy notebook were removed. Runtime protocols and ordered database migrations were retained. The source-only publish candidate passed Gitleaks and exact checks against the locally configured credentials. A clean source checkout, without private environment files or Expo-generated route types, passed the website build, mobile typecheck and 93 shared/mobile tests using the installed locked dependencies. Full Python/model tests add 47 passing tests, for 140 total. Firmware compilation passed. No APK or production deployment was triggered.

## Remaining acceptance

- Target Android: native Maps key authorization, gallery picker, microphone/TTS, BLE reconnect, safe areas, TalkBack/large text, foreground/background permission, screen-off ride and process recovery on the target OEM.
- Helmet: ESP32-CAM streaming/reconnect, moving GNSS/camera timing, measured IMU, actual UART/BLE/OLED warnings alongside navigation, physical PTT, battery measurement and sustained thermal/power/USB stability.
- Model: larger labeled helmet footage including Indian wet/night roads, shadows, patches and manholes; select operational thresholds on validation data. The tiny diagnostic subset is not a general accuracy claim.
- Deployment: publish the latest clients to the intended domain, check owner Auth redirects/SMTP, define retention/account-deletion/contact procedures and review billing/quotas. Old public pages and old APKs predate the current source.
- Release: APK generation remains paused. Prototype signing is not production signing. Private GitHub repository releases are not anonymously accessible to the app updater.

Training, always-listening voice, new hardware features and Play Store publication remain outside the requested scope. Google free allowances/trial eligibility are account-dependent; the ₹100 billing alert is not a spending cap.
