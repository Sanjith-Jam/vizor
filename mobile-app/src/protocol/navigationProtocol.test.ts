import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NavigationDirection,
  directionFromOsrm,
  encodeNavigationPacket,
  navigationPacketForStep,
} from "./navigationProtocol";

test("directionFromOsrm: arrive maps to DESTINATION regardless of modifier", () => {
  assert.equal(
    directionFromOsrm({ type: "arrive", modifier: "left" }),
    NavigationDirection.DESTINATION,
  );
});

test("directionFromOsrm: uturn modifier maps to U_TURN", () => {
  assert.equal(
    directionFromOsrm({ type: "turn", modifier: "uturn" }),
    NavigationDirection.U_TURN,
  );
});

test("directionFromOsrm: left/right modifiers map correctly, case-insensitively", () => {
  assert.equal(directionFromOsrm({ type: "turn", modifier: "Left" }), NavigationDirection.LEFT);
  assert.equal(directionFromOsrm({ type: "turn", modifier: "slight right" }), NavigationDirection.RIGHT);
});

test("directionFromOsrm: missing modifier defaults to STRAIGHT", () => {
  assert.equal(directionFromOsrm({ type: "continue" }), NavigationDirection.STRAIGHT);
});

test("encodeNavigationPacket: encodes direction and big-endian distance", () => {
  const pkt = encodeNavigationPacket(NavigationDirection.RIGHT, 120);
  assert.deepEqual(Array.from(pkt), [NavigationDirection.RIGHT, 0x00, 0x78]);
});

test("encodeNavigationPacket: clamps negative distance to 0", () => {
  const pkt = encodeNavigationPacket(NavigationDirection.STRAIGHT, -5);
  assert.deepEqual(Array.from(pkt), [NavigationDirection.STRAIGHT, 0, 0]);
});

test("encodeNavigationPacket: clamps distance above u16 max", () => {
  const pkt = encodeNavigationPacket(NavigationDirection.STRAIGHT, 100_000);
  assert.deepEqual(Array.from(pkt), [NavigationDirection.STRAIGHT, 0xff, 0xff]);
});

test("encodeNavigationPacket: rounds fractional distances", () => {
  const pkt = encodeNavigationPacket(NavigationDirection.STRAIGHT, 10.6);
  assert.equal((pkt[1] << 8) | pkt[2], 11);
});

test("encodeNavigationPacket: rejects non-finite distance", () => {
  assert.throws(() => encodeNavigationPacket(NavigationDirection.STRAIGHT, NaN));
  assert.throws(() => encodeNavigationPacket(NavigationDirection.STRAIGHT, Infinity));
});

test("navigationPacketForStep: combines maneuver mapping and distance encoding", () => {
  const pkt = navigationPacketForStep({ type: "turn", modifier: "right" }, 45);
  assert.deepEqual(Array.from(pkt), [NavigationDirection.RIGHT, 0, 45]);
});
