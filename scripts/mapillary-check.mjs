// Measures what Mapillary already has for Vizor's areas: street photos,
// pothole detections and speed-bump map features / signs. Prints counts only;
// the token comes from MAPILLARY_TOKEN and is never printed.
// Run from GitHub Actions ("Mapillary coverage check") or locally:
//   MAPILLARY_TOKEN=MLY|... node scripts/mapillary-check.mjs
const token = process.env.MAPILLARY_TOKEN;
if (!token) {
  console.error("MAPILLARY_TOKEN is not set.");
  process.exit(1);
}
const API = "https://graph.mapillary.com";
// ~2.2 km squares: Mapillary rejects large bounding boxes.
const HALF = 0.01;
const AREAS = [
  ["Bengaluru - Indiranagar", 12.9719, 77.6412],
  ["Bengaluru - Koramangala", 12.9352, 77.6245],
  ["Bengaluru - MG Road", 12.9757, 77.6055],
  ["Vellore - VIT / Katpadi", 12.9692, 79.1559],
  ["Chennai - T Nagar", 13.0418, 80.2341],
  ["Delhi - Connaught Place", 28.6315, 77.2167],
];
const SAMPLE_IMAGES = 40;

async function get(path, params) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  const text = await response.text();
  if (!response.ok)
    throw new Error(
      `HTTP ${response.status}: ${text.slice(0, 160).replaceAll(token, "***")}`,
    );
  return JSON.parse(text);
}

// Sanity checks before the per-area counts: token shape (no value printed)
// and a control area with known heavy coverage, by query token and by header.
console.log(
  `token looks like a client token (MLY|...): ${token.startsWith("MLY|")}, length ${token.length}, has whitespace: ${/\s/.test(token)}`,
);
const control = "-122.4194,37.7749,-122.4094,37.7849"; // central San Francisco
for (const [label, init] of [
  ["query token", null],
  ["OAuth header", { headers: { Authorization: `OAuth ${token}` } }],
]) {
  try {
    const url = new URL(`${API}/images`);
    url.searchParams.set("bbox", control);
    url.searchParams.set("fields", "id,captured_at");
    url.searchParams.set("limit", "5");
    if (!init) url.searchParams.set("access_token", token);
    const response = await fetch(url, {
      ...(init || {}),
      signal: AbortSignal.timeout(60000),
    });
    const text = (await response.text()).replaceAll(token, "***");
    console.log(
      `control (${label}): HTTP ${response.status} ${text.slice(0, 200)}`,
    );
  } catch (e) {
    console.log(`control (${label}) failed: ${e.message}`);
  }
}

const isPothole = (v) => /pothole/i.test(v);
const isBump = (v) => /speed.?bump|speed.?hump|bump|hump|uneven/i.test(v);

for (const [name, lat, lon] of AREAS) {
  const bbox = [lon - HALF, lat - HALF, lon + HALF, lat + HALF]
    .map((n) => n.toFixed(5))
    .join(",");
  console.log(`\n== ${name} (bbox ${bbox})`);
  try {
    const images = await get("/images", {
      bbox,
      fields: "id,captured_at",
      limit: "2000",
    });
    const list = images.data || [];
    const years = {};
    for (const i of list) {
      const y = new Date(i.captured_at).getUTCFullYear();
      years[y] = (years[y] || 0) + 1;
    }
    console.log(
      `street photos: ${list.length}${list.length >= 2000 ? "+" : ""}`,
    );
    console.log(`photos by year: ${JSON.stringify(years)}`);

    const features = await get("/map_features", {
      bbox,
      fields: "id,object_value,first_seen_at,last_seen_at",
      limit: "2000",
    });
    const values = {};
    for (const f of features.data || [])
      values[f.object_value] = (values[f.object_value] || 0) + 1;
    const relevant = Object.entries(values).filter(
      ([v]) => isPothole(v) || isBump(v),
    );
    console.log(`map features: ${(features.data || []).length}`);
    console.log(
      `pothole / speed-bump map features: ${relevant.length ? JSON.stringify(Object.fromEntries(relevant)) : "none"}`,
    );

    // Pothole detections exist per photo; sample the newest photos.
    const sample = list
      .sort((a, b) => b.captured_at - a.captured_at)
      .slice(0, SAMPLE_IMAGES);
    let withPothole = 0,
      potholeDetections = 0,
      failed = 0;
    const detectionValues = {};
    for (const image of sample) {
      try {
        const d = await get(`/${image.id}/detections`, { fields: "value" });
        let found = 0;
        for (const x of d.data || []) {
          detectionValues[x.value] = (detectionValues[x.value] || 0) + 1;
          if (isPothole(x.value)) found++;
        }
        potholeDetections += found;
        if (found) withPothole++;
      } catch {
        failed++;
      }
    }
    const potholeValues = Object.entries(detectionValues).filter(([v]) =>
      isPothole(v),
    );
    console.log(
      `newest ${sample.length} photos: ${withPothole} with potholes (${potholeDetections} detections), ${failed} lookups failed`,
    );
    console.log(
      `pothole detection labels: ${potholeValues.length ? JSON.stringify(Object.fromEntries(potholeValues)) : "none"}`,
    );
    console.log(
      `most common detection labels: ${JSON.stringify(
        Object.entries(detectionValues)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8),
      )}`,
    );
  } catch (e) {
    console.log(`failed: ${e.message}`);
  }
}
