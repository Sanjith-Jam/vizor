import test from "node:test";
import assert from "node:assert/strict";
import { adminChanges, ADMIN_RESOURCES } from "./admin.ts";
test("admin edits reject invalid coordinates and preserve unknown versus zero", () => {
  const fields = ADMIN_RESOURCES.observations.fields;
  assert.throws(
    () =>
      adminChanges(
        fields,
        { lat: "91", lon: "79", accuracy_m: "", confidence: "0.4" },
        null,
      ),
    /range/,
  );
  assert.throws(
    () =>
      adminChanges(
        fields,
        { lat: "NaN", lon: "79", accuracy_m: "", confidence: "0.4" },
        null,
      ),
    /range/,
  );
  const r = adminChanges(
    fields,
    { lat: "0", lon: "0", accuracy_m: "", confidence: "0" },
    null,
  );
  assert.deepEqual(r.changes, {
    lat: 0,
    lon: 0,
    accuracy_m: null,
    confidence: 0,
  });
});
test("changed fields carry original values for server conflict checks", () => {
  const original = { name: "Pi", user_id: "owner" };
  assert.deepEqual(
    adminChanges(ADMIN_RESOURCES.devices.fields, { name: "Helmet" }, original),
    { changes: { name: "Helmet" }, expected: { name: "Pi" } },
  );
  assert.throws(
    () =>
      adminChanges(ADMIN_RESOURCES.devices.fields, { name: "Pi" }, original),
    /No changes/,
  );
  assert.throws(
    () =>
      adminChanges(
        ADMIN_RESOURCES.potholes.fields,
        { lat: "12", lon: "79", uncertainty_m: "15", status: "verified" },
        null,
      ),
    /valid/,
  );
});
