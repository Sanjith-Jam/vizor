// Run against a disposable local Supabase stack; no production data is touched.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const config = JSON.parse(await readFile(".tools/local-supabase.json", "utf8"));
const url = config.API_URL,
  key = config.ANON_KEY;
assert(
  url?.startsWith("http://127.0.0.1:"),
  "Only local verification is supported.",
);
const request = async (path, body, token = key) => {
  const r = await fetch(url + path, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
};
async function user() {
  const email = `test-${crypto.randomUUID()}@example.com`;
  const r = await request("/auth/v1/signup", {
    email,
    password: crypto.randomUUID() + "Aa1!",
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert(r.data.access_token, "Local email confirmation must be disabled");
  return r.data;
}
const a = await user(),
  b = await user();
const api = (action, payload = {}, token = a.access_token, deviceSecret) =>
  request("/functions/v1/api", { action, payload, deviceSecret }, token);
const rpc = (name, args, token = a.access_token) =>
  request("/rest/v1/rpc/" + name, args, token);
const device = await api("registerDevice", { name: "Verification replay" });
assert.equal(device.status, 200, JSON.stringify(device.data));
assert(device.data.token);
const event = {
  eventId: crypto.randomUUID(),
  source: "vision",
  observedAt: new Date().toISOString(),
  location: { lat: 12.973, lon: 77.601 },
  accuracyMeters: 6,
  confidence: 0.8,
  modelRevision: "verification",
};
assert.equal(
  (
    await api(
      "map",
      { bounds: { south: 12, north: 12.1, west: 77, east: 77.1 } },
      key,
    )
  ).status,
  401,
);
const first = await api("observe", event);
assert.equal(first.status, 200, JSON.stringify(first.data));
assert(!first.data.duplicate);
const retry = await api("observe", event);
assert.equal(retry.data.id, first.data.id);
assert(retry.data.duplicate);
const grouped = await api("observe", {
  ...event,
  eventId: crypto.randomUUID(),
  location: { lat: 12.97301, lon: 77.60101 },
});
assert.equal(grouped.data.potholeId, first.data.potholeId);
assert.equal(
  (
    await api("observe", {
      ...event,
      eventId: crypto.randomUUID(),
      location: { lat: 91, lon: 77 },
    })
  ).status,
  400,
);
assert.equal(
  (
    await api(
      "observe",
      { ...event, eventId: crypto.randomUUID(), deviceId: device.data.id },
      b.access_token,
    )
  ).status,
  400,
);
assert.equal(
  (
    await rpc("ingest_observation", {
      payload: {
        ...event,
        eventId: crypto.randomUUID(),
        evidencePath: b.user.id + "/x.jpg",
      },
    })
  ).status,
  400,
);
assert.equal(
  (
    await api(
      "observe",
      { ...event, eventId: crypto.randomUUID() },
      key,
      "0".repeat(64),
    )
  ).status,
  400,
);
const replay = await api(
  "observe",
  { ...event, eventId: crypto.randomUUID(), source: "replay" },
  key,
  device.data.token,
);
assert.equal(replay.status, 200, JSON.stringify(replay.data));
assert.equal(replay.data.potholeId, null);
const bounds = { south: 12.97, north: 12.98, west: 77.6, east: 77.61 };
const map = await api("map", { bounds });
assert.equal(map.status, 200);
const hazard = map.data.find((h) => h.id === first.data.potholeId);
assert.equal(hazard.status, "suspected");
assert.equal(hazard.sightings, 2);
assert(!("user_id" in hazard));
const replayMap = await api("map", { bounds, replay: true });
assert(replayMap.data.some((h) => h.id === replay.data.id));
assert.equal(
  (await api("map", { bounds, replay: true }, b.access_token)).data.length,
  0,
);
const privateRows = await fetch(url + "/rest/v1/observations?select=id", {
  headers: { apikey: key, Authorization: `Bearer ${b.access_token}` },
}).then((r) => r.json());
assert.deepEqual(privateRows, []);
await api("report", { id: hazard.id, verdict: "repaired" });
assert.equal(
  (await api("map", { bounds })).data.find((h) => h.id === hazard.id).status,
  "disputed",
);
await api("report", { id: hazard.id, verdict: "repaired" }, b.access_token);
assert.equal(
  (await api("map", { bounds })).data.find((h) => h.id === hazard.id).status,
  "repaired",
);
assert.equal(
  (await api("map", { bounds: { south: 0, north: 50, west: 0, east: 50 } }))
    .status,
  400,
);
assert.equal((await api("places", { query: "Bengaluru" })).status, 503);
assert.equal((await api("assistant", { text: "Where am I?" })).status, 503);
for (let i = 0; i < 15; i++)
  await rpc("consume_request_budget", {
    request_kind: "assistant",
    request_limit: 99999,
  });
assert.equal(
  (
    await rpc("consume_request_budget", {
      request_kind: "assistant",
      request_limit: 99999,
    })
  ).data,
  false,
);
await mkdir("output/verification", { recursive: true });
await writeFile(
  "output/verification/backend.json",
  JSON.stringify(
    {
      passed: true,
      checks: [
        "authentication",
        "event idempotency",
        "candidate grouping without verification",
        "coordinate validation",
        "device ownership",
        "RPC evidence ownership",
        "device credential rejection",
        "replay isolation",
        "private observations",
        "repair corroboration",
        "bounded queries",
        "missing service states",
        "server-owned rate budget",
      ],
    },
    null,
    2,
  ),
);
// Credentials only in ignored local files for the recorded end-to-end demonstration.
await writeFile(
  ".tools/demo-session.json",
  JSON.stringify({ url, key, session: a, device: device.data }),
  { mode: 0o600 },
);
console.log(
  "PASS: 13 backend integration checks; local demo credentials saved privately.",
);
