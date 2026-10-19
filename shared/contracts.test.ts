import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateObservation,
  validateReply,
  flushQueue,
  routeHazards,
  upcomingHazards,
  googleRoutes,
} from "./contracts.ts";
const observation = {
  eventId: "a",
  source: "vision",
  observedAt: new Date().toISOString(),
  location: { lat: 12, lon: 77 },
  accuracyMeters: 5,
  confidence: 0.8,
};
test("observation trust boundary rejects invalid GPS and fabricated measurements", () => {
  assert.equal(validateObservation(observation).eventId, "a");
  for (const patch of [
    { location: { lat: 91, lon: 77 } },
    { confidence: 2 },
    { gForce: NaN },
    { observedAt: "bad" },
    { source: "random" },
    { accuracyMeters: -1 },
  ])
    assert.throws(() => validateObservation({ ...observation, ...patch }));
});
test("assistant cannot introduce arbitrary executable actions", () => {
  assert.throws(() =>
    validateReply({ message: "ok", transcript: "ok", action: "delete" }),
  );
  assert.throws(() =>
    validateReply({ message: "ok", transcript: "go", action: "navigate" }),
  );
});
test("failed uploads remain queued and successful uploads leave the queue", async () => {
  assert.deepEqual(
    await flushQueue([{ eventId: "a" }, { eventId: "b" }], async (x) => {
      if (x.eventId === "b") throw Error("offline");
    }),
    [{ eventId: "b" }],
  );
});
test("route warnings exclude repaired, adjacent and already passed hazards", () => {
  const p = (id: string, lat: number, lon: number, status = "suspected") =>
    ({
      id,
      lat,
      lon,
      status,
      sightings: 1,
      first_seen: "",
      last_seen: "",
      uncertainty_m: 5,
    }) as any;
  const route = [
    { lat: 12, lon: 77 },
    { lat: 12.01, lon: 77 },
  ];
  const hazards = [
    p("ahead", 12.005, 77),
    p("behind", 12.001, 77),
    p("adjacent", 12.005, 77.001),
    p("fixed", 12.005, 77, "repaired"),
  ];
  assert.deepEqual(
    routeHazards(route, hazards).map((p) => p.id),
    ["ahead", "behind"],
  );
  assert.deepEqual(
    upcomingHazards(route, { lat: 12.004, lon: 77 }, hazards).map((p) => p.id),
    ["ahead"],
  );
});
test("Google parser requires actual geometry and never manufactures alternatives", () => {
  assert.deepEqual(googleRoutes({ routes: [] }), []);
  assert.throws(() => googleRoutes({ routes: [{}] }));
});

test("off-route riders do not receive warnings from another road", () => {
  assert.deepEqual(
    upcomingHazards(
      [
        { lat: 12, lon: 77 },
        { lat: 12.01, lon: 77 },
      ],
      { lat: 12, lon: 77.01 },
      [
        {
          id: "p",
          lat: 12.001,
          lon: 77,
          status: "suspected",
          sightings: 1,
          first_seen: "",
          last_seen: "",
          uncertainty_m: 5,
        },
      ],
    ),
    [],
  );
});

test("route plans reject incomplete or invalid guidance before navigation", async () => {
  const { validateRoutePlans } = await import("./contracts.ts");
  const { DEMO_ROUTE } = await import("./demo.ts");
  assert.equal(validateRoutePlans([DEMO_ROUTE])[0], DEMO_ROUTE);
  for (const value of [
    [],
    null,
    [{ ...DEMO_ROUTE, distance: NaN }],
    [
      {
        ...DEMO_ROUTE,
        geometry: [
          { lat: 999, lon: 0 },
          { lat: 0, lon: 0 },
        ],
      },
    ],
    [{ ...DEMO_ROUTE, steps: [] }],
  ])
    assert.throws(() => validateRoutePlans(value));
});
