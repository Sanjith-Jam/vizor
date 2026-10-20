# Vizor project context

Updated: 20 October 2026

## Project

Vizor is a connected riding prototype: a web rider dashboard, Android companion, shared pothole intelligence service, and Banana Pi edge inference pipeline. The website and APK are published. The GitHub repository is private.

- Website: https://vizor-connected-riding.astute-jay-0484.chatgpt.site
- Live Katpadi map demo: https://vizor-connected-riding.astute-jay-0484.chatgpt.site/demo
- Android release v1.4.0: https://github.com/Sanjith-Jam/vizor/releases/tag/app-v1.4.0
- APK: https://github.com/Sanjith-Jam/vizor/releases/download/app-v1.4.0/vizor-1.4.0-arm64.apk
- Source: https://github.com/Sanjith-Jam/vizor
- Local workspace: `/home/bread/Documents/ChatGPT/AR-Helmet`
- Latest source commit: use `git log -1`; current release is 1.4.0 with the administration console.

The APK is Android 7+ / ARM64, package `com.anonymous.arhelmetnav`, version code 6. SHA-256: `0a4cdfdf5564568d0a9f080a9aab8190bb2785710a8c6e2a082ea569fba8518c`. Its prototype signing certificate matches the prior app build. GitHub releases require repository access, so anonymous in-app APK updates are unavailable.

## Latest live demo state (20 October 2026)

The signed-in Vizor account was verified as the intended rider. The Banana Pi is reachable over the saved SSH host key at its current Tailscale address, and `vizor-photo.service` is active. Its device credential was rotated and paired to the account with account ownership verified through `device_identity`. The private photo lab showed **Photo worker connected**. A private RDD2022 demo upload completed on the Pi: 1 pothole, 38% confidence, 1499 ms measured inference, and a private observation at the illustrative demo coordinate. No shared road hazard was published.

Vizor now has a server-enforced console at `/admin` with owner/admin/moderator/rider roles, permission management, application data editors and audit records. The verified account is the application owner. Normal rider access stays user-scoped under RLS; the Pi writes only to its paired account. Service credentials never enter the client.


- Website was updated and deployed as Site version 6, including `/admin`. Its public Google Maps JS key permits the Vizor hosted origin and remains restricted to Maps JavaScript API. Settings can take up to five minutes to propagate.
- Supabase Auth redirects already include the hosted Site. Supabase project and photo inference pipeline are deployed.
- Banana Pi edge worker is configured on the home network at `192.168.29.251`; its private SSH/device/Supabase credentials are stored outside Git under the ignored `.tools` workspace state. Never copy them into this file or the repository.
- Google server and Gemini keys belong in Supabase server secrets only. Public browser/Android keys are restricted client values.
- Release APK signature and SHA-256 were verified. Known server secrets were absent from APK and hosted Site build artifacts. Local mobile/website build and 93 shared/mobile tests passed. GitHub CI run `39363928408` passed all five jobs.
- The hosted Katpadi Google map rendered with sample hazards and route preview. These are demo/sample records, not live roadway truth.

## Key directories and guides

- `website/`: React/Vite public site, rider dashboard, photo lab.
- `mobile-app/`: Expo/React Native Android client.
- `shared/`: cross-client schemas, route/map data, and validation.
- `supabase/`: migrations and authenticated edge functions.
- `vision-ai/`: Banana Pi inference worker and pinned model assets.
- `firmware/`: ESP32/OLED firmware.
- `hardware/`: wiring and component notes.
- `docs/SETUP.md`: new-machine setup and environment variables.
- `docs/LIVE_DEMO.md`: photo inference demo flow.
- `docs/HARDWARE.md`: Banana Pi, SIM7600X, wiring and network notes.
- `docs/VERIFICATION.md`: validation results and remaining acceptance.
- `docs/ARCHITECTURE.md`: data ownership and system design.

## Remaining acceptance

Physical Android runtime is not certified: verify native Maps, gallery/photo permissions, microphone/TTS, BLE reconnect, TalkBack/large text, screen-off tracking and process recovery on the target phone. ESP32-CAM, moving GNSS/IMU timing, UART/BLE/OLED output and battery measurement still need physical hardware checks. Evaluate model thresholds on a larger labeled set of Indian road footage, including wet/night images and negatives such as shadows, patches and manholes. The current prototype signing key is for sideloading only, not Play Store publication. Review Google billing/quota limits; the ₹100 billing alert is not a spending cap.

This is a supervised demonstration, not a road-safety-certified product. See `docs/VERIFICATION.md` for the detailed caveats.

## 20 October 2026 navigation, assistant and admin update

- New Vizor icon (visor arc + yellow nav arrow) for Android adaptive/launcher/splash and website favicon/apple-touch-icon.
- Routing: both clients have From (current location or searched place) and To; "My location" button; "Navigate in Google Maps" hands off to Google Maps turn-by-turn (two-wheeler). Places search is location-biased (30 km around rider or Katpadi).
- Maps: potholes are small status-colored dots (amber suspected, red corroborated, grey disputed, green repaired; `HAZARD_COLORS` in `shared/googleMapView.ts`), Google-style blue rider dot, red destination pin, compact legend on the website.
- Gemini: system prompt + JSON response schema, full ride context (`assistantContext` in `shared/contracts.ts`), last 8 turns of history, new actions `locate`/`start`, optional `origin` for "from X to Y".
- The API and hosted Site include the assistant/places updates and admin panel; APK 1.4.0 (versionCode 6) is the release artifact. Native map tiles require the "APP" Android key restricted to package `com.anonymous.arhelmetnav` + SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`.

## Administration publication

Owner/admin/moderator/rider controls and seven admin sections are deployed. The migration is recorded as `202610200001` in Supabase migration history. SQL permission/lifecycle checks and 96 shared/mobile tests passed; ordinary rider HTTP administration requests return 403. Browser acceptance covered the role/user/data screens, a disposable device edit and its audit, private evidence, and desktop/mobile layouts. The Pi was unreachable during final inspection; the console correctly reports a stale heartbeat.
