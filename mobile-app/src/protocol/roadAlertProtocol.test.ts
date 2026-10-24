import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeRoadAlertPacket, RoadAlertType } from "./roadAlertProtocol";

test("encodeRoadAlertPacket: type byte then big-endian metres", () => {
  assert.deepEqual(
    [...encodeRoadAlertPacket(RoadAlertType.SPEED_BREAKER, 300)],
    [2, 0x01, 0x2c],
  );
  assert.deepEqual(
    [...encodeRoadAlertPacket(RoadAlertType.BAD_ROAD, 0)],
    [3, 0, 0],
  );
});

test("encodeRoadAlertPacket: clamps and rounds distance", () => {
  assert.deepEqual(
    [...encodeRoadAlertPacket(RoadAlertType.POTHOLE, 70000)],
    [1, 0xff, 0xff],
  );
  assert.deepEqual(
    [...encodeRoadAlertPacket(RoadAlertType.POTHOLE, -4)],
    [1, 0, 0],
  );
  assert.deepEqual(
    [...encodeRoadAlertPacket(RoadAlertType.POTHOLE, 12.6)],
    [1, 0, 13],
  );
  assert.throws(() => encodeRoadAlertPacket(RoadAlertType.POTHOLE, NaN));
});
