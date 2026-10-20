# Setup

This guide is the canonical software setup. For the original machine, private environment files already exist: do not replace them with blank examples. New clones contain no credentials, SDKs, weights, generated native projects or APKs.

## 1. Client dependencies and configuration

Use Node.js 22.13+ with npm. From the repository root:

```sh
npm --prefix website ci
npm --prefix mobile-app ci
# New machine only:
cp website/.env.example website/.env.local
cp mobile-app/.env.example mobile-app/.env
```

| Value | Website | Android / app web preview |
| --- | --- | --- |
| Supabase project URL | `VITE_SUPABASE_URL` | `EXPO_PUBLIC_SUPABASE_URL` |
| Supabase public anon key | `VITE_SUPABASE_ANON_KEY` | `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
| Restricted browser Maps key | `VITE_GOOGLE_MAPS_KEY` | `EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY` |
| Restricted native Maps key | — | `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY` |

The server key, Gemini key, Supabase service-role key and device tokens must never go into either client. Optional map IDs and APK URL are described in the examples.

```sh
npm run website
# Another terminal:
npm --prefix mobile-app run web -- --port 8083
```

Website: `http://localhost:5173`. App preview: `http://localhost:8083`. `/lab` and `/live-demo` are the connected photo screens. Sign in with the same account in both. Product and recorded-demo controls remain usable without cloud activation; missing map credentials show a setup state.

For a website production build: `npm --prefix website run build`. For an app web export, run `npx expo export --platform web --clear --output-dir ../output/mobile-web` inside `mobile-app/`. Clear Expo's transform cache after changing public environment variables.

## 2. Supabase

Install the Supabase CLI through its supported package distribution. For cloud deployment:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
# New machine only:
cp supabase/.env.example supabase/.env
# Fill secrets in a private editor, then:
supabase secrets set --env-file supabase/.env
supabase functions deploy api --no-verify-jwt
```

All migrations in `supabase/migrations/` are ordered and additive. Keep the legacy migration: the road-intelligence schema extends it. Back up an existing database before applying migrations. Evidence storage is private and RLS separates users. The API verifies user/device credentials itself; `--no-verify-jwt` permits the device-token flow, not unauthenticated hazard access.

Set Auth Site URL to the website and allowed redirects to its `/reset-password` route and `arhelmetnav://auth`. Configure email confirmation and SMTP for real user enrollment. Protect database credentials and server environment files with mode 600. Supabase project refs and public anon keys are configuration, not substitutes for RLS.

For local integration tests, install Docker and use a disposable Supabase stack:

```sh
mkdir -p .tools
supabase start -x studio,imgproxy,logflare,vector,supavisor
supabase status -o json > .tools/local-supabase.json
supabase functions serve api --no-verify-jwt --env-file supabase/.env
# Another terminal:
node scripts/verify-backend.mjs
```

The local status and test-session files contain credentials. They stay ignored. Stop the stack with `supabase stop` when done. The test script rejects non-local targets.

## 3. Google Maps

Enable Maps JavaScript API, Maps SDK for Android, Places API (New) and Routes API. Use three separate keys:

| Key | Application restriction | API restriction |
| --- | --- | --- |
| Website / app web preview | HTTP referrers | Maps JavaScript API |
| Android | Package + SHA-1 signing certificate | Maps SDK for Android |
| Server | Server-only secret; fixed egress IP only if available | Places API (New), Routes API |

Local browser referrers: `http://localhost:5173/*`, `http://127.0.0.1:5173/*`, `http://localhost:8083/*`, `http://127.0.0.1:8083/*`. Add the exact production HTTPS origin when deploying. Android package is `com.anonymous.arhelmetnav`. The existing prototype certificate SHA-1 is `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`; verify the certificate of the actual build before relying on it.

Set `GOOGLE_MAPS_SERVER_KEY` only in `supabase/.env` and deployed server secrets. HTTP-referrer and Android restrictions are unsuitable for server requests. Hosted Supabase functions generally do not provide a fixed outbound IP by default; do not invent an IP restriction that breaks routing.

Maps mount when opened. Realtime hazard overlays do not periodically recreate them. Search and route actions use authenticated server requests with per-user request budgets. Preserve Google attribution and do not cache Google map content for offline use.

Billing/free allowances depend on the account and current Google terms. The original setup displayed a Free Trial. A ₹100 billing alert is a notification, not a cap. Review adjustable API quotas and billing before public traffic. [Google billing documentation](https://developers.google.com/maps/billing-and-pricing/billing-overview).

## 4. Gemini

Set server-only `GEMINI_API_KEY` and `GEMINI_MODEL` in `supabase/.env`, then redeploy secrets/API. The configured `gemini-3.8-flash` model passed a real text request on 19 October 2026; model availability is account-dependent. The assistant validates allowed actions; urgent guidance and hazard warnings remain deterministic. Microphone requests begin only after push-to-talk. Phone microphone/TTS acceptance is still pending.

## 5. Banana Pi and demonstration

Follow [Hardware](HARDWARE.md) for the Pi runtime/networking and [Live demo](LIVE_DEMO.md) for the cloud photo worker. Register the Pi under the same account as the clients. Install its shown-once device token in a root-owned mode-600 environment file on the board, never in Git. A new account requires its own registered device/token.

## 6. Android development and optional release

The v1.3.1 prototype APK is published in the private repository’s Releases. Browser preview, typecheck and JS export do not prove Android runtime behavior. Native development requires JDK 17, Android SDK 36, compatible build tools, NDK 27.1.12297006 and CMake 3.22.1. BLE requires a native development build; Expo Go is insufficient.

```sh
cd mobile-app
npx expo install --check
npx expo prebuild --platform android --no-install
npx expo export --platform android --output-dir ../output/android-js-current
```

`scripts/build-android.sh` produces `output/android/vizor-<app-version>-arm64.apk` using `ANDROID_HOME` and `JAVA_HOME`. Generated `android/` is ignored. Retain the existing prototype signing certificate for sideload upgrades; Play Store production signing is a separate release task.

The APK workflow runs manually and uploads a compile-check artifact; normal pushes run tests/build checks. Publish a locally configured, verified APK separately so a tag build cannot replace it with an unconfigured artifact. The configured update repository is `Sanjith-Jam/vizor`. Because it is private, anonymous in-app release checks cannot download private releases and fail open; do not embed a GitHub token in the app. Set up a public distribution endpoint before using release updates.
