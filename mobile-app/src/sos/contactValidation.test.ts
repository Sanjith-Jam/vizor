import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidPhone, parseContacts } from "./contactValidation";

test("isValidPhone accepts common real-world formats", () => {
  assert.equal(isValidPhone("+1 555-123-4567"), true);
  assert.equal(isValidPhone("(555) 123-4567"), true);
  assert.equal(isValidPhone("9876543210"), true);
});

test("isValidPhone rejects too-short or too-long digit strings", () => {
  assert.equal(isValidPhone("12345"), false);
  assert.equal(isValidPhone("1".repeat(16)), false);
});

test("parseContacts returns [] for null/empty/malformed input", () => {
  assert.deepEqual(parseContacts(null), []);
  assert.deepEqual(parseContacts(""), []);
  assert.deepEqual(parseContacts("{not json"), []);
  assert.deepEqual(parseContacts('{"not":"an array"}'), []);
});

test("parseContacts round-trips a valid contact list", () => {
  const contacts = [{ id: "1", name: "Mom", phone: "+1 555-123-4567" }];
  assert.deepEqual(parseContacts(JSON.stringify(contacts)), contacts);
});

test("parseContacts filters out malformed entries without dropping valid ones", () => {
  const raw = JSON.stringify([
    { id: "1", name: "Mom", phone: "+15551234567" },
    { id: "2", name: "Bad" }, // missing phone
    "not an object",
    { id: "3", name: "Dad", phone: "+15559876543" },
  ]);
  const result = parseContacts(raw);
  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((c) => c.id),
    ["1", "3"],
  );
});
