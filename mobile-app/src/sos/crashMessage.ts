import type { HazardEvent } from "../protocol/hazardProtocol";

/** Pure message/URL formatting, kept separate from dispatchSos.ts's
 *  react-native Linking import so it can be unit-tested with plain Node. */

export function crashLocationMessage(event: HazardEvent): string {
  if (!event.hasGpsFix) {
    return "Possible crash detected by my AR helmet. No GPS fix was available at the time.";
  }
  return (
    `Possible crash detected by my AR helmet at ${event.lat.toFixed(6)}, ${event.lon.toFixed(6)}. ` +
    mapsUrl(event.lat, event.lon)
  );
}

export function mapsUrl(lat: number, lon: number): string {
  return `https://maps.google.com/?q=${lat},${lon}`;
}

export function telUrl(phone: string): string {
  return `tel:${phone}`;
}

export function smsUrl(phone: string, body: string): string {
  return `sms:${phone}?body=${encodeURIComponent(body)}`;
}
