import { test } from "node:test";
import assert from "node:assert/strict";
import { bytesToBase64, base64ToBytes } from "./base64";

function strToBytes(s: string): Uint8Array {
  return new Uint8Array(Array.from(s, (c) => c.charCodeAt(0)));
}

// Classic RFC 4648 test vectors.
const VECTORS: [string, string][] = [
  ["", ""],
  ["f", "Zg=="],
  ["fo", "Zm8="],
  ["foo", "Zm9v"],
  ["foob", "Zm9vYg=="],
  ["fooba", "Zm9vYmE="],
  ["foobar", "Zm9vYmFy"],
];

test("bytesToBase64 matches RFC 4648 test vectors", () => {
  for (const [input, expected] of VECTORS) {
    assert.equal(bytesToBase64(strToBytes(input)), expected, `encoding ${JSON.stringify(input)}`);
  }
});

test("base64ToBytes matches RFC 4648 test vectors", () => {
  for (const [expected, input] of VECTORS) {
    assert.deepEqual(Array.from(base64ToBytes(input)), Array.from(strToBytes(expected)), `decoding ${JSON.stringify(input)}`);
  }
});

test("round-trips arbitrary binary data (all byte values, non-text)", () => {
  const bytes = new Uint8Array(256);
  for (let i = 0; i < 256; i++) bytes[i] = i;
  const roundTripped = base64ToBytes(bytesToBase64(bytes));
  assert.deepEqual(Array.from(roundTripped), Array.from(bytes));
});

test("round-trips a real hazard-event-shaped 11-byte packet, including negative fixed-point bytes", () => {
  // Mirrors firmware/src/main.cpp's sendHazardEvent() layout: a CRASH_DETECTED
  // event with a negative (southern-hemisphere) latitude in the payload.
  const packet = new Uint8Array([2, 0x02, 0x26, 0xfd, 0xf0, 0x03, 0xc0, 0x09, 0x03, 0x13, 0x14]);
  const roundTripped = base64ToBytes(bytesToBase64(packet));
  assert.deepEqual(Array.from(roundTripped), Array.from(packet));
});

test("decode tolerates missing padding and whitespace", () => {
  assert.deepEqual(Array.from(base64ToBytes("Zm9v")), Array.from(strToBytes("foo")));
  assert.deepEqual(Array.from(base64ToBytes(" Zm 9v ")), Array.from(strToBytes("foo")));
});
