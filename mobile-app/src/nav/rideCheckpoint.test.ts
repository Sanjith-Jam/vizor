import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCheckpoint } from "./rideCheckpoint";
test("ride recovery rejects corrupt, future and stale sessions", () => {
  assert.equal(parseCheckpoint("bad"), null);
  assert.equal(
    parseCheckpoint(JSON.stringify({ startedAt: Date.now() + 10000 })),
    null,
  );
  assert.equal(parseCheckpoint(JSON.stringify({ startedAt: 0 })), null);
});
test("ride recovery retains monotonic maneuver progress", () => {
  const session = {
    startedAt: Date.now() - 5000,
    settings: {},
    distance: 100,
    nextStep: 3,
  };
  assert.equal(parseCheckpoint(JSON.stringify(session))?.nextStep, 3);
});
