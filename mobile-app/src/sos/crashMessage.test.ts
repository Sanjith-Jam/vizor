import { test } from "node:test";
import assert from "node:assert/strict";
import { crashLocationMessage, mapsUrl, telUrl, smsUrl } from "./crashMessage";
import { HazardEventType, type HazardEvent } from "../protocol/hazardProtocol";

const eventWithFix: HazardEvent = {
  type: HazardEventType.CRASH_DETECTED,
  gForce: 5.5,
  lat: -33.8688,
  lon: 151.2093,
  hasGpsFix: true,
};

const eventNoFix: HazardEvent = {
  ...eventWithFix,
  lat: 0,
  lon: 0,
  hasGpsFix: false,
};

test("crashLocationMessage includes coordinates and a maps link when there's a fix", () => {
  const message = crashLocationMessage(eventWithFix);
  assert.match(message, /-33\.8688/);
  assert.match(message, /151\.2093/);
  assert.match(message, /maps\.google\.com/);
});

test("crashLocationMessage says so plainly when there's no GPS fix, without fake coordinates", () => {
  const message = crashLocationMessage(eventNoFix);
  assert.match(message, /no gps fix/i);
  assert.doesNotMatch(message, /maps\.google\.com/);
});

test("mapsUrl/telUrl/smsUrl build well-formed scheme URLs", () => {
  assert.equal(mapsUrl(1.5, -2.5), "https://maps.google.com/?q=1.5,-2.5");
  assert.equal(telUrl("+15551234567"), "tel:+15551234567");
  assert.equal(smsUrl("+15551234567", "hi there"), "sms:+15551234567?body=hi%20there");
});
