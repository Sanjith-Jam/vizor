/**
 * Road surface pothole and hazard detection logic.
 *
 * Evaluates road surface geometry, dark depression contrast, and temporal
 * consensus across frames to spot potholes ahead in the vehicle's forward lane.
 */

import { AvoidanceDirection } from "../protocol/voicePrompts";

export interface PotholeCandidate {
  x: number; // Normalized center X [0, 1]
  y: number; // Normalized center Y [0, 1]
  width: number; // Normalized width [0, 1]
  height: number; // Normalized height [0, 1]
  confidence: number; // [0, 1]
  depthIndex?: number;
}

export interface DetectedPothole {
  id: string;
  distanceMeters: number;
  confidence: number;
  direction: AvoidanceDirection;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  detectedAt: number;
}

export interface RoadScannerConfig {
  /** Confidence threshold to consider a candidate valid [0, 1]. Default 0.60. */
  confidenceThreshold: number;
  /** Number of consensus hits required in the sliding window. Default 2. */
  consensusHits: number;
  /** Sliding window length in frames. Default 3. */
  consensusFrames: number;
  /** Camera mounting height above road in meters. Default 1.2m (motorcycle handlebar). */
  cameraHeightMeters: number;
}

export const DEFAULT_SCANNER_CONFIG: RoadScannerConfig = {
  confidenceThreshold: 0.6,
  consensusHits: 2,
  consensusFrames: 3,
  cameraHeightMeters: 1.2,
};

/**
 * Calculates estimated distance to a road hazard based on its normalized vertical
 * position in the forward camera perspective (lower on screen = closer).
 */
export function estimateDistanceMeters(y: number, cameraHeightMeters: number = 1.2): number {
  const clampedY = Math.max(0.1, Math.min(0.95, y));
  // Perspective projection model: distance is inversely proportional to ground angle
  const groundFactor = (clampedY - 0.45) / 0.5;
  if (groundFactor <= 0) return 40; // Far horizon
  const dist = cameraHeightMeters / Math.tan(Math.max(0.05, groundFactor * 0.8));
  return Math.round(Math.min(50, Math.max(2, dist)));
}

/**
 * Determines recommended avoidance direction based on the pothole's lateral offset
 * relative to the center of the lane (0.50).
 */
export function getAvoidanceDirection(x: number): AvoidanceDirection {
  if (x < 0.45) return "RIGHT";
  if (x > 0.55) return "LEFT";
  return "RIGHT"; // Default to right for center potholes
}

export class RoadPotholeDetector {
  private config: RoadScannerConfig;
  private recentHits: PotholeCandidate[] = [];

  constructor(config: Partial<RoadScannerConfig> = {}) {
    this.config = { ...DEFAULT_SCANNER_CONFIG, ...config };
  }

  /**
   * Processes a frame's detected road depression candidates through lane gating
   * and temporal consensus filtering.
   */
  processCandidates(candidates: PotholeCandidate[]): DetectedPothole | null {
    // 1. Lane gate: only candidates in the lower 50% and central 70% of view (rider lane)
    const valid = candidates.filter(
      (c) =>
        c.confidence >= this.config.confidenceThreshold &&
        c.y >= 0.5 &&
        c.x >= 0.15 &&
        c.x <= 0.85,
    );

    if (valid.length > 0) {
      // Pick highest confidence candidate in this frame
      const best = valid.reduce((max, c) => (c.confidence > max.confidence ? c : max), valid[0]);
      this.recentHits.push(best);
    }

    if (this.recentHits.length > this.config.consensusFrames) {
      this.recentHits.shift();
    }

    // 2. Consensus check: requires at least consensusHits in the sliding window
    if (this.recentHits.length >= this.config.consensusHits) {
      const latest = this.recentHits[this.recentHits.length - 1];
      const distanceMeters = estimateDistanceMeters(latest.y, this.config.cameraHeightMeters);
      const direction = getAvoidanceDirection(latest.x);

      return {
        id: `pothole-${Date.now()}`,
        distanceMeters,
        confidence: latest.confidence,
        direction,
        boundingBox: {
          x: latest.x,
          y: latest.y,
          width: latest.width,
          height: latest.height,
        },
        detectedAt: Date.now(),
      };
    }

    return null;
  }

  reset(): void {
    this.recentHits = [];
  }
}
