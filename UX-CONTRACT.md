# Map workflow contract

Source: user request 2026-10-18 — Katpadi-only showcase, map cost below ₹100.

| Capability         | Canonical owner                                  | Behavior                                                                                             | Verification                              |
| ------------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Map                | RoadMap / MapCanvas                              | Google Maps real geography, Katpadi initial coverage, visible attribution, in-frame error/retry      | Web browser; native typecheck/bundle      |
| Destination search | shared/katpadi.ts                                | Explicit local landmark search, clear action, no fabricated match; map pin alternative               | shared/katpadi.test.ts                    |
| Route preview      | Google Routes API + validateRoutePlans           | Actual Google routes/alternatives, authenticated requests, server rate budgets and client validation | shared/katpadi.test.ts; nav/route.test.ts |
| Feedback           | Existing dashboard error/reply and native Banner | Loading → result or actionable error; sample ride available without routing service                  | Browser flow                              |
| Sample data        | shared/demo.ts                                   | Road geometry from OSM/OSRM; scripted positions and sample hazards, never uploaded as live records   | shared tests                              |

Sample landmark search is local. Live search/routes send queries/endpoints to Google through authenticated server functions. Embedded maps use Google Maps client keys. Missing keys have an explicit setup state. No alternative map/routing provider is used. Existing backend authentication, observation ownership and privacy rules are unchanged. The prototype is English, metric and Asia/Kolkata; no payment or subscription flow is part of maps.

## Mobile redesign contract

- Canonical actions and data stay in existing providers: Ride, HelmetConnection, Cloud, History, Settings. Reuse Button, Card, ListRow and AppText for consistent controls and spring feedback.
- Onboarding may skip permissions, contacts and pairing; users can return through Profile. Denied/blocked permissions show recovery. No browser Bluetooth success is simulated.
- Four tabs: Ride, Hazards, Helmet, Profile. Focus and stack transitions respect OS reduced motion. Decorative loops stop when unfocused. Alerts remain legible and actionable.
- Destination selection uses real Katpadi geography. Recorded sample route/hazards remain explicitly labeled and cannot start a real ride. GPS permission is requested only when a real position is needed.
- Light surfaces must preserve readable muted text; dark HUD and SOS text use explicit contrasting colors. `theme/contrast.test.ts` checks normal-text roles at 4.5:1.
- No new APK is part of this redesign. Native compatibility is checked with types, tests and JS export; Bluetooth, Android safe areas, large system text and screen-off behavior require physical device review.

- Speed warnings are removed from preferences and ride processing; legacy stored limits are discarded without deleting other preferences.
- Readiness checks and charts derive solely from actual local/cloud state. Empty weeks remain zero. Report layer filters change only displayed records, never verification status. Assistant shortcut chips prefill a request; they do not auto-record or auto-submit.

## Connected photo workflow

The canonical backend owners are `queue_inference`, `claim_inference`, `finish_inference`, `cancel_inference` and `retry_inference`; both clients use the same jobs, private evidence and observations. Shared result validation and marker eligibility live in `shared/contracts.ts`. Native uploads use Expo ImagePicker/ImageManipulator; web uses a labeled file input and canvas JPEG normalization. UUIDs survive retries of the same request. One photo represents one approximate location even with multiple boxes. Only completed positive detections become map points. Real reports require explicit actual-location confirmation; replay never becomes a shared pothole.

Realtime refresh is debounced, with reconnect/foreground/manual catch-up. Freshness clocks are local; Google Maps never polls. Cloud jobs survive client closure. Failed/cancelled jobs can retry; lease attempts never repeat across retries. Maps are opt-in per screen. Signed private evidence expires. Prepared, unsubmitted photos are screen-local and must be reselected after closing. Lists show latest 20 jobs / 30 observations deliberately for this showcase.
