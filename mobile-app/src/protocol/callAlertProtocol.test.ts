import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encodeCallAlertPacket,
  decodeCallAction,
  CallEventType,
  CallAction,
  MAX_CALLER_NAME_LENGTH,
} from "./callAlertProtocol";

function bytesToAscii(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join("");
}

test("encodeCallAlertPacket: RINGING encodes header + name bytes", () => {
  const pkt = encodeCallAlertPacket(CallEventType.RINGING, "Alex");
  assert.equal(pkt.length, 6);
  assert.equal(pkt[0], CallEventType.RINGING);
  assert.equal(pkt[1], 4);
  assert.equal(bytesToAscii(pkt.slice(2)), "Alex");
});

test("encodeCallAlertPacket: ENDED always has a zero-length name, even if one is passed", () => {
  const pkt = encodeCallAlertPacket(CallEventType.ENDED, "Alex");
  assert.deepEqual(Array.from(pkt), [CallEventType.ENDED, 0]);
});

test("encodeCallAlertPacket: empty caller name still encodes a valid header-only packet", () => {
  const pkt = encodeCallAlertPacket(CallEventType.RINGING, "");
  assert.deepEqual(Array.from(pkt), [CallEventType.RINGING, 0]);
});

test("encodeCallAlertPacket: truncates to MAX_CALLER_NAME_LENGTH and fits the default 20-byte ATT MTU", () => {
  const pkt = encodeCallAlertPacket(CallEventType.RINGING, "A".repeat(40));
  assert.equal(pkt.length, 2 + MAX_CALLER_NAME_LENGTH);
  assert.equal(pkt[1], MAX_CALLER_NAME_LENGTH);
  assert.ok(pkt.length <= 20, `packet must fit the default ATT MTU, got ${pkt.length} bytes`);
});

test("encodeCallAlertPacket: sanitizes non-ASCII to '?' (SSD1306 default font is ASCII-only)", () => {
  const pkt = encodeCallAlertPacket(CallEventType.RINGING, "José 😀");
  const name = bytesToAscii(pkt.slice(2));
  assert.match(name, /^[\x20-\x7e]*$/, `sanitized name should be pure ASCII, got ${JSON.stringify(name)}`);
  assert.ok(name.startsWith("Jos") && name.includes("?"));
});

test("decodeCallAction: round-trips ACCEPT and DECLINE", () => {
  assert.equal(decodeCallAction(new Uint8Array([CallAction.ACCEPT])), CallAction.ACCEPT);
  assert.equal(decodeCallAction(new Uint8Array([CallAction.DECLINE])), CallAction.DECLINE);
});

test("decodeCallAction: rejects empty or unknown bytes", () => {
  assert.equal(decodeCallAction(new Uint8Array([])), null);
  assert.equal(decodeCallAction(new Uint8Array([99])), null);
});
