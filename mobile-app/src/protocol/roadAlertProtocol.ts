/**
 * Road alert packet the app writes to the helmet HUD for hazards known from
 * maps (reported potholes, mapped or rider-marked speed breakers, bad road).
 * Optional characteristic: older firmware lacks it and the app skips writes.
 * Layout: [type: u8][distance metres: u16, big-endian].
 */

export enum RoadAlertType {
  POTHOLE = 1,
  SPEED_BREAKER = 2,
  BAD_ROAD = 3,
}

export function encodeRoadAlertPacket(
  type: RoadAlertType,
  distanceMeters: number,
): Uint8Array {
  if (!Number.isFinite(distanceMeters)) {
    throw new Error("distanceMeters must be a finite number");
  }
  const distance = Math.min(65_535, Math.max(0, Math.round(distanceMeters)));
  return new Uint8Array([type, (distance >> 8) & 0xff, distance & 0xff]);
}
