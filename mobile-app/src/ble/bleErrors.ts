/**
 * Turns react-native-ble-plx's raw error strings into something a rider can
 * act on. Pure (no RN imports) so it's unit-tested in bleErrors.test.ts.
 */

export type BleErrorKind = "unauthorized" | "powered-off" | "unsupported" | "timeout" | "disconnected" | "unknown";

export interface FriendlyBleError {
  kind: BleErrorKind;
  message: string;
}

export function friendlyBleError(raw: string, action: "scan" | "connect" | "write" = "connect"): FriendlyBleError {
  const text = raw.toLowerCase();

  if (text.includes("not authorized") || text.includes("unauthorized") || text.includes("permission")) {
    return {
      kind: "unauthorized",
      message: "Bluetooth permission is needed to find your helmet. Allow \"Nearby devices\" and Location for this app.",
    };
  }
  if (text.includes("powered off") || text.includes("poweredoff") || text.includes("bluetooth is off")) {
    return { kind: "powered-off", message: "Bluetooth is turned off. Turn it on to connect to your helmet." };
  }
  if (text.includes("unsupported")) {
    return { kind: "unsupported", message: "This phone doesn't support Bluetooth Low Energy." };
  }
  if (text.includes("timed out") || text.includes("timeout")) {
    return {
      kind: "timeout",
      message: "The helmet took too long to respond. Move closer and make sure it's switched on.",
    };
  }
  if (text.includes("disconnected") || text.includes("not connected")) {
    return { kind: "disconnected", message: "The helmet disconnected. Reconnect it from the Helmet tab." };
  }

  const verb = action === "scan" ? "search for" : action === "write" ? "send to" : "connect to";
  return { kind: "unknown", message: `Couldn't ${verb} the helmet. Please try again.` };
}

/** Exponential backoff (1s, 2s, 4s ... capped) for automatic reconnects. */
export function reconnectDelayMs(attempt: number, capMs = 30_000): number {
  return Math.min(capMs, 1000 * 2 ** Math.max(0, attempt));
}
