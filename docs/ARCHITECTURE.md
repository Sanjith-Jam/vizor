# Architecture

## Current working photo path

```text
Website / Android companion
  → authenticated Supabase API → private JPEG + inference_jobs queue
  ← realtime job/observation changes
Banana Pi photo worker
  → outbound HTTPS claim → real Nano640 NCNN inference
  → private annotated evidence + fenced completion
Supabase
  → one observation per positive photo → demo layer or shared suspected hazard
Website / app
  → result, SQL-backed activity, Google map point, scripted warning preview
```

Both clients use `shared/contracts.ts` for validation and inference marker eligibility. Browser Google rendering lives in `shared/googleMapView.ts`; Android uses native Google Maps. Gemini, Places and Routes run behind the authenticated server API; server keys never enter client bundles.

## Ownership and publication

Jobs, raw evidence, device credentials, observations and personal trips belong to a user and are protected by RLS. Shared map queries expose approximate pothole records without rider identity. Photo mode `demo` produces private `replay` observations and never publishes a shared hazard. Mode `report` requires explicit confirmation of the photo's actual capture location; it creates a suspected candidate, not automatic verification.

One photo has one approximate map location even when the model finds multiple boxes. Nearby sightings can group as candidates; proximity alone is not proof of one physical pothole. Confirmation/repair reports retain corroboration rules. Battery and sensor values remain null/unavailable without actual measurements.

## Queue and recovery

`queue_inference` validates ownership, evidence path, location and bounded pending jobs. Upload UUIDs are idempotent. Device tokens authenticate `worker_heartbeat`, `claim_inference` and `finish_inference`. Claims have a three-minute lease; each retry cycle allows three attempts. Attempts stay monotonic across manual retry so late workers cannot complete a newer claim. Cancellation prevents publication. Completed results are idempotent. Zero detections create no observation or map marker.

The photo worker makes outbound HTTPS only and opens no public Pi port. Clients debounce realtime refreshes and catch up on reconnect/foreground/manual refresh. Their freshness clock is local. Prepared but unsent photos are screen-local; queued jobs survive closing either client. Signed evidence URLs expire.

## Camera and helmet path — hardware acceptance pending

```text
ESP32-CAM MJPEG + SIM7600X GNSS + measured IMU
  → Banana Pi bpi_inference.py → serial owner → ESP32-S3 → OLED
Phone Google route → maneuver progress → BLE → ESP32-S3 → navigation arrow
```

The camera runner owns the MCU UART; the GNSS reader owns the modem's separate AT/NMEA port. Do not launch competing serial writers. The photo service does not use either serial path. It must not imply connected camera, GPS, BLE or OLED health from its heartbeat.

Navigation packets are three bytes: one direction byte and a big-endian uint16 distance in metres. Directions are LEFT, RIGHT, STRAIGHT, U-TURN and DESTINATION. See `mobile-app/src/protocol/` and `firmware/src/main.cpp` for exact contracts. GPS and pothole UART messages preserve existing compatibility. A pothole warning retains the next navigation arrow/distance; no safe steering direction is inferred from an image.

The app retains SOS contacts/countdown behavior. Unsupported native call controls remain unavailable. Hardware push-to-talk routes to the app assistant; always-listening voice is outside scope. Active ride recovery uses persisted checkpoints and a background location task beyond mounted React listeners, but target-phone screen-off/OEM lifecycle acceptance is still required.
