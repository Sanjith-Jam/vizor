/** Navigation packet shared by the companion app and ESP32 HUD. */

export enum NavigationDirection {
  LEFT = 1,
  RIGHT = 2,
  STRAIGHT = 3,
  U_TURN = 4,
  DESTINATION = 5,
}

export type OsrmManeuver = {
  type: string;
  modifier?: string;
};

/** Reduce OSRM's detailed maneuver vocabulary to the five HUD directions. */
export function directionFromOsrm(
  maneuver: OsrmManeuver,
): NavigationDirection {
  const type = maneuver.type.toLowerCase();
  const modifier = (maneuver.modifier ?? "straight").toLowerCase();

  if (type === "arrive") {
    return NavigationDirection.DESTINATION;
  }
  if (modifier === "uturn") {
    return NavigationDirection.U_TURN;
  }
  if (modifier.includes("left")) {
    return NavigationDirection.LEFT;
  }
  if (modifier.includes("right")) {
    return NavigationDirection.RIGHT;
  }
  return NavigationDirection.STRAIGHT;
}

/**
 * Encode exactly what the helmet needs:
 * [direction: u8][distance metres: u16, big-endian].
 */
export function encodeNavigationPacket(
  direction: NavigationDirection,
  distanceMeters: number,
): Uint8Array {
  if (!Number.isFinite(distanceMeters)) {
    throw new Error("distanceMeters must be a finite number");
  }

  const distance = Math.min(65_535, Math.max(0, Math.round(distanceMeters)));
  return new Uint8Array([
    direction,
    (distance >> 8) & 0xff,
    distance & 0xff,
  ]);
}

/** Convert an OSRM step and live distance-to-maneuver into one BLE write. */
export function navigationPacketForStep(
  maneuver: OsrmManeuver,
  distanceToManeuverMeters: number,
): Uint8Array {
  return encodeNavigationPacket(
    directionFromOsrm(maneuver),
    distanceToManeuverMeters,
  );
}
