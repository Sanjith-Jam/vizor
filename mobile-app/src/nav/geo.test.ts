import { test } from "node:test";
import assert from "node:assert/strict";
import {
  distanceToPolylineMeters,
  formatDistance,
  formatDuration,
  formatSpeed,
  haversineMeters,
  speedValue,
} from "./geo";

test("haversine: 0.001 deg latitude is ~111 m", () => {
  const d = haversineMeters({ lat: 12.97, lon: 77.59 }, { lat: 12.971, lon: 77.59 });
  assert.ok(Math.abs(d - 111.2) < 1, `got ${d}`);
});

test("distance to polyline is perpendicular distance to the nearest segment", () => {
  const line = [
    { lat: 0, lon: 0 },
    { lat: 0, lon: 0.01 },
  ];
  const d = distanceToPolylineMeters({ lat: 0.0005, lon: 0.005 }, line);
  assert.ok(Math.abs(d - 55.6) < 1, `got ${d}`);
  // Beyond the segment end, distance is to the endpoint.
  const end = distanceToPolylineMeters({ lat: 0, lon: 0.011 }, line);
  assert.ok(Math.abs(end - 111.3) < 1, `got ${end}`);
});

test("formatDistance rounds sensibly in both unit systems", () => {
  assert.equal(formatDistance(42, "metric"), "40 m");
  assert.equal(formatDistance(347, "metric"), "350 m");
  assert.equal(formatDistance(2345, "metric"), "2.3 km");
  assert.equal(formatDistance(25_400, "metric"), "25 km");
  assert.equal(formatDistance(100, "imperial"), "330 ft");
  assert.equal(formatDistance(3218.7, "imperial"), "2.0 mi");
});

test("speed + duration formatting", () => {
  assert.equal(formatSpeed(10, "metric"), "36 km/h");
  assert.equal(formatSpeed(10, "imperial"), "22 mph");
  assert.equal(speedValue(-1, "metric"), 0);
  assert.equal(formatDuration(45), "45 s");
  assert.equal(formatDuration(600), "10 min");
  assert.equal(formatDuration(3900), "1 h 5 min");
});
