# Vizor companion

Expo / React Native Android source with a browser preview. Four tabs: Ride, Hazards, Helmet and Profile; history/settings sit under Profile. Quiet paper surfaces, bundled DM Sans, original artwork and reduced-motion-aware controls complement steady navigation/HUD screens.

## Run

```sh
npm ci
# New machine only: copy .env.example to .env and configure public client keys.
npm run web -- --port 8083
npm run typecheck
npm test
```

Full configuration: [Setup](../docs/SETUP.md). Open `/live-demo`, sign into the same account as the website, choose a road photo and send it to the registered Banana Pi. Results, map points and private activity come from the shared cloud queue. See [Live demo](../docs/LIVE_DEMO.md).

Browser preview uses Google Maps JavaScript and explicitly unavailable BLE. Android uses native Google Maps and real BLE, requiring a native development build rather than Expo Go. Never place server keys or device tokens in `EXPO_PUBLIC_*` variables.

The app retains navigation/progress, persisted ride recovery, SOS contacts/countdown and validated assistant commands. The scanner displays real device evidence and labeled replay; it does not generate random detections. Speed warnings have been removed. Unsupported native call answering remains unavailable. Battery stays unknown without measurements.

[Android v1.3.1](https://github.com/Sanjith-Jam/vizor/releases/tag/app-v1.3.1) is available for Android 7+ ARM64 devices. Build/release prerequisites and prototype signing are in Setup. Because the source repository is private, its GitHub releases are not anonymously available to the in-app updater; use a public distribution endpoint before relying on updates. [Verification and remaining phone checks](../docs/VERIFICATION.md).
