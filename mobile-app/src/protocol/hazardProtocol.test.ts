import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encodeHazardEvent,
  decodeHazardEvent,
  HazardEventType,
} from "./hazardProtocol";

test("round-trips a crash event with a real-world negative latitude", () => {
  const pkt = encodeHazardEvent(HazardEventType.CRASH_DETECTED, 5.5, -33.8688, 151.2093);
  assert.equal(pkt.length, 11);

  const decoded = decodeHazardEvent(pkt);
  assert.ok(decoded);
  assert.equal(decoded.type, HazardEventType.CRASH_DETECTED);
  assert.ok(Math.abs(decoded.gForce - 5.5) < 1e-9);
  assert.ok(Math.abs(decoded.lat - -33.8688) < 1e-9);
  assert.ok(Math.abs(decoded.lon - 151.2093) < 1e-9);
  assert.equal(decoded.hasGpsFix, true);
});

test("lat=lon=0 decodes to hasGpsFix=false", () => {
  const pkt = encodeHazardEvent(HazardEventType.POTHOLE_BUMP, 2.8, 0, 0);
  const decoded = decodeHazardEvent(pkt);
  assert.ok(decoded);
  assert.equal(decoded.hasGpsFix, false);
});

test("SOS_CANCELLED round-trips like the other event types", () => {
  const pkt = encodeHazardEvent(HazardEventType.SOS_CANCELLED, 4.1, 12.5, -70.25);
  const decoded = decodeHazardEvent(pkt);
  assert.ok(decoded);
  assert.equal(decoded.type, HazardEventType.SOS_CANCELLED);
});

test("g-force clamps to the 16-bit field's max instead of overflowing", () => {
  const pkt = encodeHazardEvent(HazardEventType.CRASH_DETECTED, 9999, 0, 0);
  const decoded = decodeHazardEvent(pkt);
  assert.ok(decoded);
  assert.ok(Math.abs(decoded.gForce - 655.35) < 1e-9);
});

test("rejects short/malformed packets and unknown event types", () => {
  assert.equal(decodeHazardEvent(new Uint8Array([1, 2, 3])), null);

  const badType = encodeHazardEvent(HazardEventType.CRASH_DETECTED, 1, 0, 0);
  badType[0] = 99;
  assert.equal(decodeHazardEvent(badType), null);
});

test("decodes a packet built the same way firmware/src/main.cpp's sendHazardEvent() does", () => {
  // Hand-built (not through our own encoder), so this can't share a bug with it.
  const raw = new Uint8Array(11);
  raw[0] = HazardEventType.CRASH_DETECTED;
  const gForceFixed = 550; // 5.50g
  raw[1] = (gForceFixed >> 8) & 0xff;
  raw[2] = gForceFixed & 0xff;

  const writeI32BE = (arr: Uint8Array, offset: number, value: number) => {
    arr[offset] = (value >> 24) & 0xff;
    arr[offset + 1] = (value >> 16) & 0xff;
    arr[offset + 2] = (value >> 8) & 0xff;
    arr[offset + 3] = value & 0xff;
  };
  writeI32BE(raw, 3, -33868800); // -33.8688 deg * 1e6
  writeI32BE(raw, 7, 151209300); // 151.2093 deg * 1e6

  const decoded = decodeHazardEvent(raw);
  assert.ok(decoded);
  assert.ok(Math.abs(decoded.lat - -33.8688) < 1e-6);
  assert.ok(Math.abs(decoded.lon - 151.2093) < 1e-6);
  assert.ok(Math.abs(decoded.gForce - 5.5) < 1e-9);
});
