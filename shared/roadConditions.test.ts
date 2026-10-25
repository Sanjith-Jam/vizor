import { test } from "node:test";
import assert from "node:assert/strict";
import type { Pothole } from "./contracts.ts";
import {
  areaTiles,
  fetchRoadConditions,
  probeQuery,
  parseRoadConditions,
  rateRoad,
  routeSpeedBreakers,
  setRoadDataProxy,
  sharedSpeedBreakers,
  snapBounds,
  tagQuery,
} from "./roadConditions.ts";

const road = [
  { lat: 12.97, lon: 79.14 },
  { lat: 12.97, lon: 79.145 },
];
const pothole = (
  id: string,
  lon: number,
  status: Pothole["status"] = "suspected",
): Pothole => ({
  id,
  lat: 12.97,
  lon,
  status,
  sightings: 1,
  first_seen: "2026-10-20T00:00:00Z",
  last_seen: "2026-10-20T00:00:00Z",
  uncertainty_m: 10,
});

test("OSM speed breakers become markers; other traffic calming is ignored", () => {
  const data = parseRoadConditions(
    [
      {
        type: "node",
        id: 1,
        lat: 12.96,
        lon: 79.13,
        tags: { traffic_calming: "bump" },
      },
      {
        type: "node",
        id: 2,
        lat: 12.96,
        lon: 79.14,
        tags: { traffic_calming: "chicane" },
      },
      {
        type: "way",
        id: 3,
        tags: { highway: "residential", traffic_calming: "table" },
        geometry: [road[0], road[1], { lat: 12.971, lon: 79.146 }],
      },
    ],
    [],
  );
  assert.deepEqual(
    data.speedBreakers.map((s) => [s.id, s.kind]),
    [
      ["n1", "Speed breaker"],
      ["w3", "Raised crossing"],
    ],
  );
  assert.deepEqual(data.roads, []);
});

test("roads are rated from mapped surface and smoothness, worst first", () => {
  assert.equal(
    rateRoad({ surface: "asphalt", smoothness: "good" }, road, []),
    null,
  );
  assert.equal(rateRoad({ surface: "gravel" }, road, [])?.condition, "fair");
  assert.equal(rateRoad({ surface: "dirt" }, road, [])?.condition, "poor");
  const both = rateRoad(
    { smoothness: "very_bad", surface: "compacted" },
    road,
    [],
  );
  assert.equal(both?.condition, "poor");
  assert.deepEqual(both?.reasons, ["very bad surface", "compacted road"]);
});

test("pothole density flags a road; repaired and distant reports do not", () => {
  // The test road is ~540 m long.
  const near = [
    pothole("a", 79.141),
    pothole("b", 79.142),
    pothole("c", 79.143),
  ];
  assert.equal(rateRoad({}, road, near.slice(0, 1)), null);
  assert.equal(rateRoad({}, road, near.slice(0, 2))?.condition, "fair");
  assert.deepEqual(rateRoad({}, road, near), {
    condition: "poor",
    reasons: ["3 pothole reports"],
  });
  const repaired = near.map((p) => ({ ...p, status: "repaired" as const }));
  assert.equal(rateRoad({}, road, repaired), null);
  const far = near.map((p) => ({ ...p, lat: 12.975 }));
  assert.equal(rateRoad({}, road, far), null);
});

test("query covers the snapped view and probes roads around active potholes", () => {
  const b = snapBounds({
    south: 12.951,
    west: 79.111,
    north: 12.989,
    east: 79.149,
  });
  assert.deepEqual(b, { south: 12.94, west: 79.1, north: 13, east: 79.16 });
  const tags = tagQuery(b);
  assert.match(tags, /node\["traffic_calming"~"\^\(yes\|bump/);
  assert.match(tags, /\(12\.94,79\.1,13,79\.16\)/);
  assert.match(tags, /out tags geom;$/);
  const probe = probeQuery(b, [{ lat: 12.97, lon: 79.141 }]);
  assert.match(probe, /\(around:20,12\.97,79\.141\)/);
  assert.doesNotMatch(probe, /traffic_calming/);
});

test("route speed breakers are those within 20 m of the line", () => {
  const breakers = [
    { id: "on", kind: "Speed breaker", lat: 12.97001, lon: 79.143 },
    { id: "off", kind: "Speed breaker", lat: 12.972, lon: 79.143 },
  ];
  assert.deepEqual(
    routeSpeedBreakers(road, breakers).map((s) => s.id),
    ["on"],
  );
});

test("rider-shared speed breakers show only once suspected or confirmed", () => {
  const rows = [
    { id: "a", lat: 12.97, lon: 79.14, status: "confirmed" },
    { id: "b", lat: 12.98, lon: 79.15, status: "suspected" },
    { id: "c", lat: 12.99, lon: 79.16, status: "candidate" },
    { id: "d", lat: 12.99, lon: 79.17, status: "removed" },
  ];
  assert.deepEqual(
    sharedSpeedBreakers(rows).map((s) => [s.id, s.kind, s.source]),
    [
      ["sa", "Speed breaker", "shared"],
      ["sb", "Possible speed breaker", "shared"],
    ],
  );
});

test("road data goes through the API cache when a proxy is set", async () => {
  const seen: string[] = [];
  setRoadDataProxy(async (request) => {
    seen.push(request.kind);
    return [
      {
        type: "node",
        id: 77,
        lat: 20.001,
        lon: 75.001,
        tags: { traffic_calming: "hump" },
      },
    ];
  });
  try {
    const data = await fetchRoadConditions(
      { south: 20, west: 75, north: 20.01, east: 75.01 },
      [],
    );
    assert.deepEqual(seen, ["tags"]);
    assert.deepEqual(
      data.speedBreakers.map((s) => s.id),
      ["n77"],
    );
  } finally {
    setRoadDataProxy(null);
  }
});

test("map views use fixed tiles, so GPS drift keeps the same cache keys", () => {
  const around = (lat: number, lon: number) => ({
    south: lat - 0.05,
    north: lat + 0.05,
    west: lon - 0.05,
    east: lon + 0.05,
  });
  // Two fixes ~100 m apart near VIT, on either side of a 0.02° grid line.
  const a = areaTiles(around(12.9693, 79.1559));
  const b = areaTiles(around(12.9702, 79.1551));
  assert.deepEqual(a, b);
  assert.deepEqual(a, [
    { south: 12.9, north: 13, west: 79.1, east: 79.2 },
    { south: 12.9, north: 13, west: 79.2, east: 79.3 },
    { south: 13, north: 13.1, west: 79.1, east: 79.2 },
    { south: 13, north: 13.1, west: 79.2, east: 79.3 },
  ]);
  // A slightly inset tile snaps back to exactly the tile, not one grid out.
  const t = a[0];
  assert.deepEqual(
    snapBounds({
      south: t.south + 1e-6,
      north: t.north - 1e-6,
      west: t.west + 1e-6,
      east: t.east - 1e-6,
    }),
    t,
  );
});
