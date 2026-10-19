import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RoadPotholeDetector,
  estimateDistanceMeters,
  getAvoidanceDirection,
  DEFAULT_SCANNER_CONFIG,
} from "./roadPotholeDetector";
import { AvoidanceDirection } from "../protocol/voicePrompts";

test("estimateDistanceMeters: closer hazards (higher Y) yield smaller distances", () => {
  const farDist = estimateDistanceMeters(0.5);
  const nearDist = estimateDistanceMeters(0.9);
  assert.ok(nearDist < farDist, `nearDist (${nearDist}) should be less than farDist (${farDist})`);
  assert.ok(nearDist >= 2, "nearDist should be clamped to >= 2m");
  assert.ok(farDist <= 50, "farDist should be clamped to <= 50m");
});

test("getAvoidanceDirection: returns LEFT when hazard is on the right, RIGHT when on the left", () => {
  assert.equal(getAvoidanceDirection(0.3), "RIGHT");
  assert.equal(getAvoidanceDirection(0.7), "LEFT");
  assert.equal(getAvoidanceDirection(0.5), "RIGHT"); // center default
});

test("RoadPotholeDetector: rejects candidates outside forward rider lane", () => {
  const detector = new RoadPotholeDetector({ consensusHits: 1 });
  // Sky/horizon (Y < 0.5)
  const sky = detector.processCandidates([
    { x: 0.5, y: 0.3, width: 0.1, height: 0.1, confidence: 0.9 },
  ]);
  assert.equal(sky, null);

  // Far sidewalk (X < 0.15)
  const sidewalk = detector.processCandidates([
    { x: 0.1, y: 0.7, width: 0.1, height: 0.1, confidence: 0.9 },
  ]);
  assert.equal(sidewalk, null);
});

test("RoadPotholeDetector: requires temporal consensus before alerting", () => {
  const detector = new RoadPotholeDetector({ consensusHits: 2, consensusFrames: 3 });
  const hit = { x: 0.5, y: 0.7, width: 0.15, height: 0.1, confidence: 0.85 };

  // Frame 1: Single hit should NOT trigger yet
  const frame1 = detector.processCandidates([hit]);
  assert.equal(frame1, null, "Frame 1 alone should not trigger alert");

  // Frame 2: Second hit in sliding window triggers detection
  const frame2 = detector.processCandidates([hit]);
  assert.ok(frame2 !== null, "Frame 2 with consensus should trigger alert");
  assert.equal(frame2?.confidence, 0.85);
  assert.ok(frame2?.distanceMeters > 0);
});

test("RoadPotholeDetector: resets recent hits on reset()", () => {
  const detector = new RoadPotholeDetector({ consensusHits: 2 });
  const hit = { x: 0.5, y: 0.7, width: 0.1, height: 0.1, confidence: 0.8 };

  detector.processCandidates([hit]);
  detector.reset();
  const next = detector.processCandidates([hit]);
  assert.equal(next, null, "Should not trigger immediately after reset");
});
