import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hazardRecordFrom,
  hazardsToCsv,
  parseList,
  prepend,
  rideTotals,
  type RideRecord,
} from "./records";
import { HazardEventType } from "../protocol/hazardProtocol";

test("prepend keeps newest first and caps the list", () => {
  assert.deepEqual(prepend([2, 1], 3, 2), [3, 2]);
});

test("hazardsToCsv writes a header and one row per record", () => {
  const rec = hazardRecordFrom(
    {
      type: HazardEventType.POTHOLE_BUMP,
      gForce: 2.456,
      lat: 12.5,
      lon: 77.25,
      hasGpsFix: true,
    },
    Date.UTC(2026, 0, 2, 3, 4, 5),
  );
  const csv = hazardsToCsv([rec]).split("\n");
  assert.equal(csv[0], "time_iso,type,g_force,lat,lon,has_gps_fix");
  assert.equal(
    csv[1],
    "2026-01-02T03:04:05.000Z,Pothole / bump,2.46,12.5,77.25,true",
  );
});

test("rideTotals sums rides", () => {
  const rides: RideRecord[] = [
    {
      id: "a",
      startedAt: 0,
      endedAt: 60_000,
      distanceMeters: 1000,
      maxSpeedMps: 10,
      destination: null,
      hazardCount: 0,
    },
    {
      id: "b",
      startedAt: 0,
      endedAt: 120_000,
      distanceMeters: 500,
      maxSpeedMps: 15,
      destination: "X",
      hazardCount: 2,
    },
  ];
  assert.deepEqual(rideTotals(rides), {
    rides: 2,
    distanceMeters: 1500,
    durationSeconds: 180,
    maxSpeedMps: 15,
  });
});

test("parseList tolerates junk", () => {
  assert.deepEqual(parseList(null), []);
  assert.deepEqual(parseList("not json"), []);
  assert.deepEqual(parseList('[{"id":"1"},{"x":2},null]'), [{ id: "1" }]);
});

test("weekly activity honors local calendar boundaries and never invents empty rides", async () => {
  const { weeklyActivity } = await import("./records");
  const now = new Date(2026, 9, 18, 16);
  const make = (day: number, meters: number): RideRecord => ({
    id: String(day),
    startedAt: new Date(2026, 9, day, 12).getTime(),
    endedAt: new Date(2026, 9, day, 13).getTime(),
    distanceMeters: meters,
    maxSpeedMps: 0,
    destination: null,
    hazardCount: 0,
  });
  const rides = [make(11, 800), make(12, 1000), make(18, 500), make(19, 9000)];
  const current = weeklyActivity(rides, 0, now);
  assert.equal(current.distanceMeters, 1500);
  assert.equal(current.rides, 2);
  assert.equal(current.days[0].distanceMeters, 1000);
  assert.equal(current.days[6].distanceMeters, 500);
  assert.equal(weeklyActivity(rides, -1, now).distanceMeters, 800);
  assert.equal(
    weeklyActivity([], 0, now).days.every(
      (day) => day.rides === 0 && day.distanceMeters === 0,
    ),
    true,
  );
});
