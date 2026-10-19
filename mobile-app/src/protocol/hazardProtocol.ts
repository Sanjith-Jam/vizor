/**
 * Hazard & SOS packet the ESP32 notifies over BLE (pothole-bump logging and
 * crash/SOS detection from the helmet's MPU6050 IMU). See
 * mobile-app/README.md's BLE Protocol Specification and
 * firmware/src/main.cpp's sendHazardEvent() for the byte layout this mirrors.
 */

export enum HazardEventType {
  POTHOLE_BUMP = 1,
  CRASH_DETECTED = 2,
  SOS_CANCELLED = 3,
}

export interface HazardEvent {
  type: HazardEventType;
  /** G-force deviation that triggered the event. */
  gForce: number;
  lat: number;
  lon: number;
  /** false when the helmet had no GPS fix yet (sent as lat=lon=0). */
  hasGpsFix: boolean;
}

const PACKET_LENGTH = 11; // [EventType:1B][G-Force:2B][Lat:4B][Lon:4B]

/**
 * Decode the ESP32's Hazard & SOS notification.
 * Payload: [EventType: 1B][G-Force: 2B big-endian, g*100]
 *          [Lat: 4B big-endian signed, deg*1e6][Lon: 4B big-endian signed, deg*1e6]
 */
export function decodeHazardEvent(bytes: Uint8Array): HazardEvent | null {
  if (bytes.length < PACKET_LENGTH) {
    return null;
  }

  const type = bytes[0];
  if (
    type !== HazardEventType.POTHOLE_BUMP &&
    type !== HazardEventType.CRASH_DETECTED &&
    type !== HazardEventType.SOS_CANCELLED
  ) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const gForce = view.getUint16(1, false) / 100;
  const lat = view.getInt32(3, false) / 1_000_000;
  const lon = view.getInt32(7, false) / 1_000_000;

  return {
    type,
    gForce,
    lat,
    lon,
    // The helmet sends (0, 0) when it has no GPS fix yet; treat that as "no
    // location" rather than the literal middle of the Gulf of Guinea.
    hasGpsFix: !(lat === 0 && lon === 0),
  };
}

/**
 * Encode a Hazard & SOS packet in the same layout the ESP32 sends. Mainly
 * useful for tests; the ESP32 is the real encoder for this characteristic.
 */
export function encodeHazardEvent(
  type: HazardEventType,
  gForce: number,
  lat: number,
  lon: number,
): Uint8Array {
  const buffer = new ArrayBuffer(PACKET_LENGTH);
  const view = new DataView(buffer);
  const clampedG = Math.max(0, Math.min(655.35, gForce));

  view.setUint8(0, type);
  view.setUint16(1, Math.round(clampedG * 100), false);
  view.setInt32(3, Math.round(lat * 1_000_000), false);
  view.setInt32(7, Math.round(lon * 1_000_000), false);

  return new Uint8Array(buffer);
}
