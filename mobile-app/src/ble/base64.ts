/**
 * Dependency-free base64 encode/decode for BLE I/O.
 *
 * react-native-ble-plx exchanges characteristic values as base64 strings
 * (the React Native bridge has no raw byte-array type), and Hermes does not
 * reliably provide btoa/atob, so this avoids depending on either one or a
 * polyfill package for what's a well-understood, easily-tested algorithm.
 */

const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function bytesToBase64(bytes: Uint8Array): string {
  let result = "";
  let i = 0;

  for (; i + 3 <= bytes.length; i += 3) {
    const chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    result +=
      BASE64_CHARS[(chunk >> 18) & 0x3f] +
      BASE64_CHARS[(chunk >> 12) & 0x3f] +
      BASE64_CHARS[(chunk >> 6) & 0x3f] +
      BASE64_CHARS[chunk & 0x3f];
  }

  const remaining = bytes.length - i;
  if (remaining === 1) {
    const chunk = bytes[i] << 16;
    result +=
      BASE64_CHARS[(chunk >> 18) & 0x3f] + BASE64_CHARS[(chunk >> 12) & 0x3f] + "==";
  } else if (remaining === 2) {
    const chunk = (bytes[i] << 16) | (bytes[i + 1] << 8);
    result +=
      BASE64_CHARS[(chunk >> 18) & 0x3f] +
      BASE64_CHARS[(chunk >> 12) & 0x3f] +
      BASE64_CHARS[(chunk >> 6) & 0x3f] +
      "=";
  }

  return result;
}

const BASE64_LOOKUP: Record<string, number> = {};
for (let i = 0; i < BASE64_CHARS.length; i++) {
  BASE64_LOOKUP[BASE64_CHARS[i]] = i;
}

export function base64ToBytes(base64: string): Uint8Array {
  const cleaned = base64.replace(/=+$/, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bitsCollected = 0;

  for (const char of cleaned) {
    const value = BASE64_LOOKUP[char];
    if (value === undefined) {
      continue; // skip whitespace/invalid characters rather than throwing
    }
    buffer = (buffer << 6) | value;
    bitsCollected += 6;
    if (bitsCollected >= 8) {
      bitsCollected -= 8;
      bytes.push((buffer >> bitsCollected) & 0xff);
    }
  }

  return new Uint8Array(bytes);
}
