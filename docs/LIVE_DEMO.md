# Connected photo showcase

Verified on 19 October 2026. This workflow uses the real Banana Pi, its pinned RDD2022 YOLOv8n NCNN model and the deployed Supabase project. It does not require ESP32-CAM or an OLED.

## Open the demonstration

- Website: http://localhost:5173/lab
- Companion app browser preview: http://localhost:8083/live-demo
- Database: [Supabase table editor](https://supabase.com/dashboard). Inspect `inference_jobs`, `observations` and `devices`.

To restart the local production previews from the repository root (configure environments first on a fresh clone):

```sh
npm --prefix website run build
npm --prefix website run preview -- --host 127.0.0.1 --port 5173 --strictPort
# In another terminal:
cd mobile-app
npx expo export --platform web --clear --output-dir ../output/mobile-web
cd ..
node website/node_modules/vite/bin/vite.js output/mobile-web --host 127.0.0.1 --port 8083 --strictPort
```

Sign in with the same account in both previews. The original setup machine retains a private showcase account outside Git; a fresh clone has no pre-created session or device credential. Other users cannot see your jobs or evidence. To use another account, register its device and install that account's new device token on the Pi.

1. Keep the Pi powered and online. Confirm **Photo worker connected**.
2. Choose **Use demo road photo**, or upload a JPG, PNG or WebP. The clients resize to at most 1280 pixels and re-encode JPEG to omit EXIF location metadata.
3. Leave **Demo layer** selected. Its Katpadi coordinate is illustrative; the bundled Indian road sample has no known Katpadi capture location. The sample control cannot submit a real road report.
4. Press **Send to Banana Pi**. Watch queued → processing → completed on both screens. No manual page refresh is required while live sync is connected.
5. Inspect the annotated image, confidence, measured inference time, pinned revision and matching job IDs. A negative image returns zero detections and creates no observation or hazard pin.
6. Open **Google Maps**. An orange `!` marks a positive detection's approximate photo location. Overlapping observations can occupy the same point. Click a road to move the next upload pin. Maps load only when opened; database updates do not recreate the map.
7. Use **Preview pothole warning** to speak the finding and show navigation alongside a hazard warning. The 120 m turn and 50 m hazard distance are explicitly scripted software previews. No BLE/UART command is sent to hardware.
8. Check **Live database activity** on the website or **Show live database rows** in the app. The event `photo-<job UUID>` links the job to its single observation. A demo record has source `replay` and no shared pothole ID.

For a genuine photo with a known capture location, select **Real report**, place/enter the actual coordinate and confirm it. Positive findings enter the shared map as approximate, suspected candidates; they are not automatically verified physical potholes. Personal trips and raw evidence remain private. Repeated boxes in one photo produce one approximate map observation, not invented per-box GPS locations.


For a SQL join in the dashboard SQL Editor, run this read-only query (the owner dashboard can see all project rows; clients remain protected by RLS):

```sql
select j.id, j.status, j.mode, j.attempts,
       j.result->'detections' as detections,
       j.result->>'inferenceMs' as inference_ms,
       o.event_id, o.source, o.pothole_id
from public.inference_jobs j
left join public.observations o on o.event_id = 'photo-' || j.id::text
order by j.created_at desc
limit 20;
```

## Recovery and ownership

The cloud queue survives closing either client or switching networks. Offline Pi jobs remain queued. The worker reconnects using outbound HTTPS; no public Pi port or port-forwarding is needed. A processing lease expires after three minutes; up to three claims are allowed per retry cycle. Manual retry uses a monotonically increasing claim version, preventing an old completion from overwriting a later attempt. Cancelling prevents a late worker completion from publishing an observation. Repeating an upload request with the same UUID does not create a second job.

An unsent selected photo is local to its current screen. Select it again if you close that screen. Signed image links are short lived; reopen/reload the view if an image expires. Realtime reconnect and foreground/manual refresh fetch current state. The 15-second client freshness clock does not call Google or poll the backend.

## Pi service

The installed service is `vizor-photo.service`, running as `helmet` with a root-owned mode-600 environment file at `/etc/vizor-photo.env`. Source: `vision-ai/photo_worker.py`; service template: `vision-ai/deploy/vizor-photo.service`. It uses `/opt/vizor/.venv` and `/opt/vizor/output/models/rdd2022-yolov8n/pothole-640_ncnn_model`.

```sh
sudo systemctl status vizor-photo.service
sudo journalctl -u vizor-photo.service -n 30 --no-pager
sudo systemctl restart vizor-photo.service
# Stop the cloud queue polling when the showcase is not needed:
sudo systemctl stop vizor-photo.service
```

The photo worker polls Supabase every five seconds while idle and reports its own heartbeat every 30 seconds. These are Supabase requests, not Google Maps/Routes/Gemini requests. It does not claim camera, GPS, MCU or OLED health. A powered worker heartbeat is distinct from a BLE helmet connection. Battery stays unavailable without measurements.

## Reproduce from the command line

`scripts/verify-photo-demo.py` uses Python's standard library. Export the project's URL/public key, a current user access token and that user's device ID as `VIZOR_SUPABASE_URL`, `VIZOR_SUPABASE_ANON_KEY`, `VIZOR_ACCESS_TOKEN`, `VIZOR_DEVICE_ID`. Do not put credentials in command arguments or source control. Then:

```sh
python scripts/verify-photo-demo.py website/public/images/rdd2022-india-sample.jpg --expect-min 1 --output output/photo-demo-repeat.json
```

The script queues a private demo, checks duplicate-request idempotency, waits for actual Pi completion and verifies observation isolation. It makes no Google/Gemini requests. It deliberately leaves the job visible for inspection.

## Services, cost and release limits

Google browser, Android and server keys are separate. The server key is restricted to Places API (New) and Routes API and deployed only to Supabase. Browser maps use restricted HTTP referrers; Android uses package/certificate restrictions. Gemini stays server-only. Google Places search is explicit; routes are requested on route actions, not periodically. Supabase applies per-user request budgets to Places/Routes/Gemini.

Google Cloud displayed an active Free Trial during setup. The ₹100 billing alert is a notification, not a spending cap, and API free usage/trial eligibility can change. See [Maps setup](SETUP.md#3-google-maps). No guarantee of permanent zero cost is made. Keep the account's billing/quotas under review before enabling public traffic.

The latest website is a local production preview; the older public site predates this photo flow. The app browser preview and Android JS export include it. **No new APK was generated**, as requested. Native Google Maps authorization, gallery selection, speech, BLE and screen-off behavior still require an Android device. Browser app speech returned an unavailable state during acceptance; the visible warning remained usable. ESP32-CAM, moving GNSS, IMU and the real OLED remain separate hardware acceptance stages.
