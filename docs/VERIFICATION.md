# Verification and remaining work

Last updated: 20 October 2026. This describes the current source and bench demonstration, not a certified riding product.

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
| Android v1.3.1 / code 5 APK | Native release build passed; ARM64, Android 7+, prototype certificate verified |
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

Current documentation is consolidated into seven guides. Unused starter UI, duplicated schema, old packaging/video scripts and the legacy notebook were removed. Runtime protocols and ordered database migrations were retained. The source-only publish candidate passed Gitleaks and exact checks against the locally configured credentials. A clean source checkout, without private environment files or Expo-generated route types, passed the website build, mobile typecheck and 93 shared/mobile tests using the installed locked dependencies. GitHub CI exposed inherited Expo compiler settings in the standalone website build; Vite now explicitly uses the website tsconfig. The failure was reproduced and the fix passed with mobile dependencies absent. Full Python/model tests add 47 passing tests, for 140 total. Firmware compilation passed. That cleanup did not trigger APK generation or deployment. The subsequent v1.3.1 release adds a configured APK and updates the hosted website.

## APK release verification

The configured v1.3.1 APK is 54,527,083 bytes, package `com.anonymous.arhelmetnav`, version code 5, minimum Android SDK 24 and target SDK 36. Its signature matches the previous prototype certificate. SHA-256: `59ef52f5237ce538f298f68f580368ff0161c6561ff7b1577bbc76b87cf2166d`. Scanning decompressed APK entries found none of the configured server keys, access token, device token or demo password. Native compilation does not establish phone runtime acceptance.

## Remaining acceptance

- Target Android: native Maps key authorization, gallery picker, microphone/TTS, BLE reconnect, safe areas, TalkBack/large text, foreground/background permission, screen-off ride and process recovery on the target OEM.
- Helmet: ESP32-CAM streaming/reconnect, moving GNSS/camera timing, measured IMU, actual UART/BLE/OLED warnings alongside navigation, physical PTT, battery measurement and sustained thermal/power/USB stability.
- Model: larger labeled helmet footage including Indian wet/night roads, shadows, patches and manholes; select operational thresholds on validation data. The tiny diagnostic subset is not a general accuracy claim.
- Deployment: verify owner SMTP delivery, define retention/account-deletion/contact procedures and review billing/quotas. The hosted origin is allowed by the restricted Maps browser key; Supabase Auth redirects include it.
- Release: the v1.3.1 APK retains prototype signing, not production signing. Private GitHub repository releases are not anonymously accessible to the app updater.

Training, always-listening voice, new hardware features and Play Store publication remain outside the requested scope. Google free allowances/trial eligibility are account-dependent; the ₹100 billing alert is not a spending cap.

## Administration and 1.4.0 publication — 20 October 2026

The administration migration and edge API were deployed. The verified signed-in account was initialized as application owner. Transactional SQL acceptance checks (rolled back) passed anonymous/rider/moderator/admin/owner authorization, editable-metadata isolation, protected fields, stale edits, last-owner protection, role changes, app suspension, device revocation, job retry claim fencing and audit records. An authenticated ordinary-rider HTTP request to list users returned 403, while its context remained rider with no admin permissions. Shared/mobile checks passed 96 tests, website production build and mobile TypeScript. The premium static audit still reports existing project-wide gaps; it is not a conformance certification.

The supplied APK 1.4.0 / code 6 is ARM64, Android 7+ (target SDK 36), signed with the existing prototype certificate. Both deployed Site output and decompressed APK passed the configured server-secret scan. Size: 54765759 bytes. SHA-256: `0a4cdfdf5564568d0a9f080a9aab8190bb2785710a8c6e2a082ea569fba8518c`. The artifact was verified rather than rebuilt in this admin task. Phone runtime remains pending.

Live browser acceptance: owner overview, user directory, role editor and self-suspension safeguard, role matrix, data search, private signed evidence, and audit listing passed. A disposable device was renamed through the review/save flow, verified in the audit trail and then removed. Escape restored focus to the originating table action. The admin layout was inspected at 1440 px and 390 px; mobile document width stayed within the viewport. The latest refinement focuses editor fields and lists exact changes before confirmation. No production user role was changed by browser testing.

At final admin inspection the Banana Pi SSH address was unreachable and its last heartbeat was stale. Earlier photo results remain available; this update does not claim a new hardware run.
