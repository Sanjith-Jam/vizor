import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeProgress,
  instructionFor,
  parseOsrmRoute,
  promptBandFor,
} from "./route";
import { NavigationDirection } from "../protocol/navigationProtocol";

// A small L-shaped route: east along lat 0, then left (north) at lon 0.01.
const osrm = {
  code: "Ok",
  routes: [
    {
      distance: 2224,
      duration: 200,
      geometry: {
        coordinates: [
          [0, 0],
          [0.01, 0],
          [0.01, 0.01],
        ],
      },
      legs: [
        {
          steps: [
            {
              distance: 1112,
              name: "Main St",
              maneuver: { type: "depart", location: [0, 0] },
            },
            {
              distance: 1112,
              name: "Hill Rd",
              maneuver: { type: "turn", modifier: "left", location: [0.01, 0] },
            },
            {
              distance: 0,
              name: "",
              maneuver: { type: "arrive", location: [0.01, 0.01] },
            },
          ],
        },
      ],
    },
  ],
};

test("parseOsrmRoute builds steps, geometry and instructions", () => {
  const route = parseOsrmRoute(osrm);
  assert.equal(route.steps.length, 3);
  assert.equal(route.geometry.length, 3);
  assert.deepEqual(route.steps[1].location, { lat: 0, lon: 0.01 });
  assert.equal(route.steps[0].instruction, "Head out on Main St");
  assert.equal(route.steps[1].instruction, "Turn left onto Hill Rd");
  assert.equal(route.steps[2].instruction, "Arrive at your destination");
});

test("parseOsrmRoute rejects a failed response", () => {
  assert.throws(
    () => parseOsrmRoute({ code: "NoRoute", message: "Impossible route" }),
    /Impossible route/,
  );
});

test("computeProgress: heading toward the left turn", () => {
  const route = parseOsrmRoute(osrm);
  const p = computeProgress(route, { lat: 0, lon: 0.005 });
  assert.equal(p.nextStepIndex, 1);
  assert.equal(p.direction, NavigationDirection.LEFT);
  assert.ok(Math.abs(p.distanceToManeuver - 556) < 2);
  assert.equal(p.offRoute, false);
  assert.equal(p.arrived, false);
});

test("computeProgress: passing the turn advances to the destination step and never goes back", () => {
  const route = parseOsrmRoute(osrm);
  const p = computeProgress(route, { lat: 0.0001, lon: 0.01 }, 1);
  assert.equal(p.nextStepIndex, 2);
  assert.equal(p.direction, NavigationDirection.DESTINATION);
  assert.equal(p.arrived, false);
  const later = computeProgress(route, { lat: 0, lon: 0.009 }, 2);
  assert.equal(later.nextStepIndex, 2);
});

test("computeProgress: off route and arrival", () => {
  const route = parseOsrmRoute(osrm);
  assert.equal(
    computeProgress(route, { lat: 0.002, lon: 0.005 }).offRoute,
    true,
  );
  const done = computeProgress(route, { lat: 0.01, lon: 0.01 }, 2);
  assert.equal(done.arrived, true);
  assert.equal(done.direction, NavigationDirection.DESTINATION);
});

test("instructionFor handles slight turns and U-turns", () => {
  assert.equal(
    instructionFor({ type: "turn", modifier: "slight right" }, ""),
    "Bear right",
  );
  assert.equal(
    instructionFor({ type: "turn", modifier: "uturn" }, "A1"),
    "Make a U-turn onto A1",
  );
});

test("promptBandFor announces each band once", () => {
  const spoken = new Set<number>();
  assert.equal(promptBandFor(800, spoken), null);
  assert.equal(promptBandFor(480, spoken), 500);
  spoken.add(500);
  assert.equal(promptBandFor(450, spoken), null);
  assert.equal(promptBandFor(150, spoken), 200);
  assert.equal(promptBandFor(30, spoken), 50);
});

test("OSRM external responses cannot introduce invalid geometry or incomplete guidance", () => {
  assert.throws(
    () =>
      parseOsrmRoute({
        code: "Ok",
        routes: [
          {
            ...osrm.routes[0],
            geometry: {
              coordinates: [
                [79, 12],
                [NaN, 12],
              ],
            },
          },
        ],
      }),
    /invalid route geometry/,
  );
  assert.throws(
    () =>
      parseOsrmRoute({ code: "Ok", routes: [{ ...osrm.routes[0], legs: [] }] }),
    /no usable navigation steps/,
  );
  assert.throws(
    () =>
      parseOsrmRoute({
        code: "Ok",
        routes: [
          {
            ...osrm.routes[0],
            legs: [
              {
                steps: [
                  {
                    distance: 10,
                    maneuver: { type: "turn", location: [79, 120] },
                  },
                ],
              },
            ],
          },
        ],
      }),
    /invalid navigation steps/,
  );
});
