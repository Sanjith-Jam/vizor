import assert from "node:assert/strict";
import test from "node:test";
import {
  validateInferenceResult,
  inferenceMarkers,
  photoDemoAlert,
  workerOnline,
  type InferenceJob,
} from "./contracts.ts";
const result = {
  modelRevision: "rdd2022-test",
  inferenceMs: 500,
  imageWidth: 640,
  imageHeight: 640,
  detections: [
    {
      confidence: 0.8,
      bbox: [0.1, 0.2, 0.5, 0.6] as [number, number, number, number],
    },
  ],
};
const job = {
  id: "job",
  device_id: "device",
  evidence_path: "private/photo.jpg",
  lat: 12.973,
  lon: 79.145,
  mode: "demo",
  status: "completed",
  created_at: new Date().toISOString(),
  completed_at: new Date().toISOString(),
  attempts: 1,
  result,
  error: null,
} as InferenceJob;
test("photo outputs reject invalid boxes, scores, dimensions and unbounded result sets", () => {
  assert.equal(validateInferenceResult(result), result);
  for (const invalid of [
    null,
    { ...result, imageWidth: 0 },
    { ...result, inferenceMs: Infinity },
    { ...result, detections: undefined },
    { ...result, detections: Array(21).fill(result.detections[0]) },
    { ...result, detections: [{ confidence: NaN, bbox: [0, 0, 1, 1] }] },
    {
      ...result,
      detections: [{ confidence: 0.7, bbox: [0.5, 0.1, 0.2, 0.4] }],
    },
    { ...result, detections: [{ confidence: 0.7, bbox: [0, 0, 2, 1] }] },
    { ...result, annotatedPath: "other/../private.jpg" },
  ])
    assert.throws(() => validateInferenceResult(invalid));
});
test("only completed positive detections produce map points in the correct layer", () => {
  const empty = { ...job, id: "empty", result: { ...result, detections: [] } };
  const real = { ...job, id: "real", mode: "report" as const };
  const queued = { ...job, id: "queued", status: "queued" as const };
  assert.deepEqual(
    inferenceMarkers([job, empty, real, queued], "demo").map((j) => j.id),
    ["job"],
  );
  assert.deepEqual(
    inferenceMarkers([job, real], "report").map((j) => j.id),
    ["real"],
  );
  assert.equal(photoDemoAlert(empty), null);
  assert.equal(photoDemoAlert(queued), null);
  assert.match(photoDemoAlert(job)!, /^Demo warning:/);
});
test("worker connection status expires and rejects future timestamps", () => {
  const d = {
    id: "1",
    name: "Pi",
    worker_seen_at: new Date(100000).toISOString(),
    worker_model: "Nano",
  };
  assert.equal(workerOnline(d, 110000), true);
  assert.equal(workerOnline(d, 200001), false);
  assert.equal(workerOnline(d, 0), false);
  assert.equal(workerOnline(undefined), false);
});
