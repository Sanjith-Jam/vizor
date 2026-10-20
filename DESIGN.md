---
version: alpha
name: Vizor
colors:
  ink: "#11120f"
  paper: "#f4f4ec"
  primary: "#e5f42b"
  route: "#718500"
typography:
  display:
    fontFamily: "Anton, Impact, sans-serif"
  body:
    fontFamily: "Inter, Arial, sans-serif"
omitted:
  - section: spacing
    reason: "Existing website CSS and native spacing tokens own geometry."
  - section: rounded
    reason: "Existing website controls and native radius tokens own shapes."
---

# Vizor

## Overview

Connected-riding prototype for a Katpadi demonstration. The map is the dashboard's primary working surface; the motorsport typography and electric yellow belong to Vizor controls, not decorative overlays on road labels. Keep the existing layout and landing page direction.

## Colors

`website/src/index.css` owns web colors; `mobile-app/src/theme/` owns native colors. Yellow identifies hazards and primary controls. Muted green identifies repaired sample hazards. A blue rider and dark destination distinguish locations from hazard reports. Google Maps uses its familiar blue route line.

## Typography

Use the existing display and body fonts. Map labels come from Google Maps and remain readable at map zoom. Do not transform or letter-space third-party attribution.

## Layout

The map keeps the established dashboard frame. Preserve drag/zoom, keyboard map controls, visible attribution and a Katpadi overview action. Keep map loading and network recovery inside the frame. Native screens reuse MapCanvas, existing Banner and Button components.

## Components

`website/src/components/RoadMap.tsx` and `mobile-app/src/components/MapCanvas.tsx` own maps. `shared/katpadi.ts` owns regional bounds and the local demo landmark catalog. Live search/routes use the authenticated Google backend. `shared/googleMapView.ts` owns the browser map renderer. Sample ride and sample potholes live in `shared/demo.ts`; they never become live observations. Sample landmark search is local; live Google Places search is explicit; a road pin can select a destination outside the landmark catalog.

## Do's and Don'ts

Show Katpadi's real geography and label scripted ride/hazard samples. Keep attribution unobscured. Keep Gemini failures independent of maps. Respect reduced motion. Use Google Maps only, with restricted client keys and server-owned Places/Routes requests. Missing keys show an honest setup state and an external Google Maps link; never a fake or alternative embedded map.

## Mobile — quiet riding companion

Updated 2026-10-18. User direction: Stoic iOS, with substantial motion; no new APK. Website motorsport styling remains distinct. Mobile uses a quieter preparation experience, with high-contrast, steady guidance while riding.

Reference evidence: inspected the public gallery on [Stoic’s App Store page](https://apps.apple.com/us/app/stoic-journal-mental-health/id1312926037) and [official website](https://www.getstoic.com/). Observed: rounded white cards on light gray, black pill controls, lowercase greetings, spacious bold headings, monochrome illustrations; dark cards in the sleep section. The supplied Mobbin flow required sign-in and was not inspected. Exact font metrics and animation timings are not verified. Our artwork and motion are original adaptations, not copied Stoic assets.

Native canonical tokens: `mobile-app/src/theme/index.ts`. Paper #F5F5F3, white cards, ink #1A1A18, control #20201E, muted #64645F; DM Sans bundled locally, 40/46 display, 30/37 title, 16/24 body. Page gutter 24, section gap 24, card radius 28, pill controls, minimum primary target 56. Status colors retain meaning. The hardware HUD stays black with yellow arrows; SOS stays red with white text.

Home contains a greeting, photographic helmet console (original concept render), quick actions, expandable readiness checklist, road-report/helmet cards, assistant commands, calendar-week activity, Google Katpadi map, safety reminder and riding journal. Activity uses saved rides only; never fabricate statistics. Hazards separates shared reports from the private sensor log. Helmet shows actual connection and measured telemetry only. Profile contains account, history, safety and preferences. Map selection keeps search, real geography and sample labeling visible.

Proposed motion: entrances 480 ms staggered 80 ms, screen focus 350 ms, 300 ms native stack transitions, spring press feedback, spring tab selection, 4.8 s gentle illustration drift and scan-only radar. OS reduced-motion preference displays final states, disables loops and stack movement; preference changes are observed. Loops pause when their screen loses focus. Navigation turns and SOS retain deterministic meaning; no decorative illustration animation in the active ride.

Responsive behavior: preparation screens scroll; text scales with system settings; cards wrap and tablet content caps at 760. Browser app preview uses Google Maps JavaScript and an explicitly unavailable BLE adapter. Android retains native Google Maps and real BLE. Do not replace device status with successful demo state.

## Follow-up direction

The user rejected an overly sparse Stoic interpretation and requested richer UI and animations. Keep the light readable foundation; add a dark photographic helmet console, compact command deck, real-data activity chart, tappable readiness details, report layers, device health and an account summary. The existing concept photo is reused and labeled. Week changes spring the activity bars; readiness rows enter in sequence. The assistant pulse reflects actual listening/processing only. Speed warning controls and automatic speed alerts are removed, including legacy saved preference parsing. Current speed/distance remain ride information.

## Connected photo demo

Web `/lab` keeps Vizor's editorial grid, condensed headings and restrained yellow actions; native `/live-demo` reuses quiet paper cards, DM Sans and existing Entrance/Button motion. Four numbered stages connect photo, device output, map and actual database activity. The device single-select is intentionally OS-owned (`native`); platform popup appearance is acceptable. Google attribution remains visible. Orange hazard markers take precedence over an overlapping destination pin.

Always distinguish the photo worker heartbeat, native BLE connection and measured sensor telemetry. Demo locations remain explicitly illustrative, and the bundled RDD2022 sample cannot be sent through the real-report control. Warning/HUD previews retain the turn while showing the hazard, label scripted distances, and send no hardware command. Long UUIDs wrap/scroll within evidence and database containers.

## Administration console

`/admin` is a working product surface: charcoal sidebar, warm white workspace, condensed page title, small uppercase table headings and restrained electric-yellow primary actions. Data density comes from aligned tables and a stable horizontal scroll region; mobile retains table semantics and a horizontally scrollable section menu. `website/src/pages/admin.css` adapts the root ink/paper/accent variables. Use native select/checkbox controls; `AdminPage` owns its modal editor, confirmation and feedback. No decorative map or animation appears in the console. Reduced motion disables its control transitions.
