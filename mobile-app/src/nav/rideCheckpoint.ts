import type { Route } from "./route";
type Place = {
  id: string;
  name: string;
  address: string;
  location: { lat: number; lon: number };
};
import type { AppSettings } from "../settings/settings";
import type { LatLon } from "./geo";
export interface RideCheckpoint {
  startedAt: number;
  route: Route | null;
  destination: Place | null;
  lastPos: LatLon | null;
  nextStep: number;
  distance: number;
  maxSpeed: number;
  lastLocationAt: number;
  lastSendAt: number;
  lastPrompt: string;
  lastReconnectAt: number;
  lastRerouteAt?: number;
  lastHazardsAt?: number;
  warningUntil?: number;
  settings: AppSettings;
  warned: string[];
}
export function parseCheckpoint(
  raw: string | null,
  now = Date.now(),
): RideCheckpoint | null {
  try {
    const s = JSON.parse(raw || "null") as RideCheckpoint;
    if (
      !s ||
      !Number.isFinite(s.startedAt) ||
      s.startedAt > now ||
      now - s.startedAt > 24 * 3600000 ||
      !s.settings ||
      !Number.isFinite(s.distance) ||
      !Number.isInteger(s.nextStep)
    )
      return null;
    return { ...s, warned: Array.isArray(s.warned) ? s.warned : [] };
  } catch {
    return null;
  }
}
