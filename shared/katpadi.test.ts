import { test } from "node:test";
import assert from "node:assert/strict";
import { inKatpadi, searchKatpadi } from "./katpadi.ts";
import { DEMO_ROUTE, DEMO_POTHOLES } from "./demo.ts";
import { routeHazards } from "./contracts.ts";

test("Katpadi demo geometry and samples stay inside the demo coverage", () => {
  assert.ok(DEMO_ROUTE.geometry.length > 20);
  assert.ok(DEMO_ROUTE.geometry.every(inKatpadi));
  assert.ok(DEMO_POTHOLES.every(inKatpadi));
  assert.equal(routeHazards(DEMO_ROUTE.geometry, DEMO_POTHOLES).length, 3);
  assert.equal(inKatpadi({ lat: 12.973, lon: 77.601 }), false);
  assert.equal(inKatpadi({ lat: NaN, lon: 79.14 }), false);
});
test("landmark search is local, case-insensitive, and does not invent results", () => {
  assert.equal(searchKatpadi("  vit  ")[0].id, "vit-vellore");
  assert.ok(searchKatpadi("Katpadi").length >= 2);
  assert.deepEqual(searchKatpadi("London"), []);
  assert.deepEqual(searchKatpadi(""), []);
});
