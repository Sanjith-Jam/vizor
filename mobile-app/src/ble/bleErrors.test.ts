import { test } from "node:test";
import assert from "node:assert/strict";
import { friendlyBleError, reconnectDelayMs } from "./bleErrors";

test("maps the Android 12 unauthorized scan error", () => {
  const e = friendlyBleError("Device is not authorized to use BluetoothLE", "scan");
  assert.equal(e.kind, "unauthorized");
  assert.match(e.message, /permission/i);
});

test("maps powered off and timeout errors", () => {
  assert.equal(friendlyBleError("BluetoothLE is powered off").kind, "powered-off");
  assert.equal(friendlyBleError("Operation timed out").kind, "timeout");
  assert.equal(friendlyBleError("Device abc was disconnected").kind, "disconnected");
});

test("falls back to an action-specific message without leaking the raw error", () => {
  const e = friendlyBleError("GATT 133 something weird", "write");
  assert.equal(e.kind, "unknown");
  assert.equal(e.message, "Couldn't send to the helmet. Please try again.");
});

test("reconnect backoff doubles and caps", () => {
  assert.equal(reconnectDelayMs(0), 1000);
  assert.equal(reconnectDelayMs(1), 2000);
  assert.equal(reconnectDelayMs(3), 8000);
  assert.equal(reconnectDelayMs(20), 30_000);
});
