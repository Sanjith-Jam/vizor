import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { upcomingHazards } from "../shared/contracts.ts";
const c = JSON.parse(await readFile(".tools/demo-session.json", "utf8"));
const r = await fetch(c.url + "/functions/v1/api", {
  method: "POST",
  headers: {
    apikey: c.key,
    Authorization: `Bearer ${c.session.access_token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    action: "map",
    payload: {
      bounds: { south: 12.97, north: 12.98, west: 77.6, east: 77.61 },
      replay: true,
    },
  }),
});
assert(r.ok);
const hazards = await r.json();
assert(hazards.length);
const geometry = [
  { lat: 12.971, lon: 77.601 },
  { lat: 12.975, lon: 77.601 },
];
assert(
  upcomingHazards(geometry, { lat: 12.972, lon: 77.601 }, hazards).length > 0,
);
assert.equal(
  upcomingHazards(geometry, { lat: 12.974, lon: 77.601 }, hazards).length,
  0,
);
await writeFile(
  "output/recorded-demo/warning.json",
  JSON.stringify(
    {
      passed: true,
      approachingWarning: true,
      passedHazardSuppressed: true,
      source: "private recorded-replay observations; synthetic GPS",
    },
    null,
    2,
  ),
);
console.log(
  "PASS: approaching-rider warning and passed-hazard suppression against uploaded replay observations.",
);
