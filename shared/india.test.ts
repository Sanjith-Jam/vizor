import { test } from "node:test";
import assert from "node:assert/strict";
import { INDIA_BOUNDS, INDIA_CENTER, reportsAvailable } from "./india.ts";
import { KATPADI_BOUNDS, KATPADI_CENTER } from "./katpadi.ts";

const inside = (p: { lat: number; lon: number }) =>
  p.lat >= INDIA_BOUNDS.south &&
  p.lat <= INDIA_BOUNDS.north &&
  p.lon >= INDIA_BOUNDS.west &&
  p.lon <= INDIA_BOUNDS.east;

test("India coverage contains the centre, Katpadi demo and major cities", () => {
  assert.ok(inside(INDIA_CENTER));
  assert.ok(inside(KATPADI_CENTER));
  for (const city of [
    { lat: 28.61, lon: 77.21 }, // Delhi
    { lat: 19.08, lon: 72.88 }, // Mumbai
    { lat: 22.57, lon: 88.36 }, // Kolkata
    { lat: 8.52, lon: 76.94 }, // Thiruvananthapuram
    { lat: 26.14, lon: 91.74 }, // Guwahati
  ])
    assert.ok(inside(city));
});

test("pothole reports load for city views, not for all-India views", () => {
  assert.equal(reportsAvailable(KATPADI_BOUNDS), true);
  assert.equal(reportsAvailable(INDIA_BOUNDS), false);
  assert.equal(
    reportsAvailable({ south: 12.5, north: 13.6, west: 80, east: 80.5 }),
    false,
  );
});
