/** Incoming-call alert packet shared by the companion app and ESP32 HUD. */

export enum CallEventType {
  RINGING = 1,
  ENDED = 2,
}

export enum CallAction {
  ACCEPT = 1,
  DECLINE = 2,
}

/**
 * Default BLE ATT MTU is 23 bytes; without negotiating a larger one, a
 * GATT write is capped at 23 - 3 (ATT opcode + handle) = 20 bytes. The
 * packet's 2-byte header leaves 18 bytes for the caller name.
 */
export const MAX_CALLER_NAME_LENGTH = 18;

/**
 * The ESP32's SSD1306 HUD uses Adafruit GFX's default font, which only
 * renders ASCII; anything else shows as garbage glyphs on a 128x64 display,
 * so caller names are sanitized before encoding rather than sent as-is.
 */
function sanitizeCallerName(name: string): string {
  return name.replace(/[^\x20-\x7e]/g, "?").slice(0, MAX_CALLER_NAME_LENGTH);
}

/**
 * Encode an incoming-call / call-ended packet for the ESP32 HUD.
 * Payload: [EventType: 1B][NameLength: 1B][Name: up to MAX_CALLER_NAME_LENGTH ASCII bytes]
 */
export function encodeCallAlertPacket(
  eventType: CallEventType,
  callerName: string = "",
): Uint8Array {
  const safeName =
    eventType === CallEventType.RINGING ? sanitizeCallerName(callerName) : "";

  const packet = new Uint8Array(2 + safeName.length);
  packet[0] = eventType;
  packet[1] = safeName.length;
  for (let i = 0; i < safeName.length; i++) {
    packet[2 + i] = safeName.charCodeAt(i);
  }
  return packet;
}

/** Decode the ESP32's accept/decline button notification. */
export function decodeCallAction(bytes: Uint8Array): CallAction | null {
  if (bytes.length < 1) {
    return null;
  }
  const value = bytes[0];
  return value === CallAction.ACCEPT || value === CallAction.DECLINE
    ? value
    : null;
}
