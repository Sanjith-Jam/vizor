import { test } from "node:test";
import assert from "node:assert/strict";
import type { Pothole } from "./contracts.ts";
import type { RoadSegment } from "./roadConditions.ts";
import {
  describeRoadReport,
  markSpeedBreaker,
  mergeRoadConditions,
  parseMarkedSpeedBreakers,
  roadStretches,
  routeCells,
  routeRoadReport,
  smoothestRoute,
  upcomingRoadAlerts,
} from "./roadAlerts.ts";

// A straight ~1.08 km road heading east.
const route = [
  { lat: 12.97, lon: 79.14 },
  { lat: 12.97, lon: 79.15 },
];
const at = (lon: number) => ({ lat: 12.97, lon });
const badRoad: RoadSegment = {
  id: "w1",
  name: "Main Road",
  path: [at(79.144), at(79.146)],
  condition: "poor",
  reasons: ["dirt road"],
};
const crossing: RoadSegment = {
  id: "w2",
  name: "Cross Street",
  path: [
    { lat: 12.968, lon: 79.143 },
    { lat: 12.972, lon: 79.143 },
  ],
  condition: "poor",
  reasons: ["ground road"],
};
const pothole = (id: string, lon: number, status: Pothole["status"]) => ({
  id,
  lat: 12.97,
  lon,
  status,
  sightings: 1,
  first_seen: "2026-10-20T00:00:00Z",
  last_seen: "2026-10-20T00:00:00Z",
  uncertainty_m: 10,
});
const breaker = { id: "n1", kind: "Speed breaker", ...at(79.1415) };
const data = {
  potholes: [pothole("p1", 79.1412, "repaired")],
  speedBreakers: [breaker],
  roads: [badRoad, crossing],
};

test("bad stretches follow parallel roads and ignore roads that only cross", () => {
  const stretches = roadStretches(route, [badRoad, crossing]);
  assert.equal(stretches.length, 1);
  assert.equal(stretches[0].roadId, "w1");
  const length = stretches[0].end - stretches[0].start;
  // 25 m sampling may overshoot the 217 m road by about one sample.
  assert.ok(length > 200 && length < 260, `stretch ${length} m`);
});

test("alerts list hazards ahead within range, nearest first", () => {
  assert.deepEqual(upcomingRoadAlerts(route, at(79.14), data), []);
  const soon = upcomingRoadAlerts(route, at(79.1405), data);
  assert.deepEqual(
    soon.map((a) => [a.kind, a.message]),
    [["speed_breaker", "Speed breaker in 110 metres. Slow down."]],
  );
  const later = upcomingRoadAlerts(route, at(79.1432), data);
  assert.deepEqual(
    later.map((a) => [a.id, a.message]),
    [["road:w1", "Bad road ahead for about 250 metres. Ride carefully."]],
  );
  // Behind the rider, or a rider far off the route, gets nothing.
  assert.deepEqual(upcomingRoadAlerts(route, at(79.147), data), []);
  assert.deepEqual(
    upcomingRoadAlerts(route, { lat: 12.975, lon: 79.1405 }, data),
    [],
  );
});

test("route reports score roughness and pick a clearly smoother route", () => {
  const rough = routeRoadReport(route, data);
  assert.equal(rough.speedBreakers, 1);
  assert.equal(rough.potholes, 0);
  assert.ok(rough.badMeters > 190);
  const clean = routeRoadReport(route, {
    potholes: [],
    speedBreakers: [],
    roads: [],
  });
  assert.equal(clean.score, 0);
  assert.equal(smoothestRoute([rough, clean]), 1);
  assert.equal(smoothestRoute([clean, { ...clean, score: 50 }]), null);
  assert.equal(smoothestRoute([rough]), null);
  assert.match(describeRoadReport(rough), /^1 speed breaker · 250 m bad road$/);
  assert.equal(
    describeRoadReport(clean),
    "No mapped speed breakers or bad roads",
  );
});

test("long routes are split into the 0.2 degree cells they pass", () => {
  const cells = routeCells([[at(79.14), at(79.65)]]);
  assert.deepEqual(
    cells.map((c) => c.west),
    [79, 79.2, 79.4, 79.6],
  );
  assert.ok(cells.every((c) => c.south === 12.8 && c.north === 13));
});

test("rider marks skip duplicates and survive a storage round trip", () => {
  const one = markSpeedBreaker([], at(79.142), [], 1);
  assert.equal(one[0].source, "rider");
  assert.equal(markSpeedBreaker(one, at(79.14205), [], 2), one);
  assert.equal(markSpeedBreaker([], at(79.1415), [breaker], 3).length, 0);
  assert.deepEqual(parseMarkedSpeedBreakers(JSON.stringify(one)), one);
  assert.deepEqual(parseMarkedSpeedBreakers("not json"), []);
  const merged = mergeRoadConditions(
    { speedBreakers: one, roads: [{ ...badRoad, condition: "fair" }] },
    { speedBreakers: one, roads: [badRoad] },
  );
  assert.equal(merged.speedBreakers.length, 1);
  assert.equal(merged.roads[0].condition, "poor");
});
