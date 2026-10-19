/** Geometry + unit formatting for navigation. Pure, unit-tested in geo.test.ts. */

import type { Units } from "../settings/settings";

export type LatLon = { lat: number; lon: number };

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineMeters(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Shortest distance from p to segment a-b. Uses a local equirectangular
 * projection, which is accurate to well under a metre at road-segment scale.
 */
export function distanceToSegmentMeters(p: LatLon, a: LatLon, b: LatLon): number {
  const cosLat = Math.cos(toRad(p.lat));
  const ax = toRad(a.lon - p.lon) * cosLat * EARTH_RADIUS_M;
  const ay = toRad(a.lat - p.lat) * EARTH_RADIUS_M;
  const bx = toRad(b.lon - p.lon) * cosLat * EARTH_RADIUS_M;
  const by = toRad(b.lat - p.lat) * EARTH_RADIUS_M;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.sqrt(cx * cx + cy * cy);
}

export function distanceToPolylineMeters(p: LatLon, line: LatLon[]): number {
  if (line.length === 0) {
    return Infinity;
  }
  if (line.length === 1) {
    return haversineMeters(p, line[0]);
  }
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    best = Math.min(best, distanceToSegmentMeters(p, line[i], line[i + 1]));
  }
  return best;
}

export function polylineLengthMeters(line: LatLon[]): number {
  let total = 0;
  for (let i = 0; i < line.length - 1; i++) {
    total += haversineMeters(line[i], line[i + 1]);
  }
  return total;
}

export const mpsToKmh = (mps: number) => mps * 3.6;
export const kmhToMph = (kmh: number) => kmh * 0.621371;

export function formatDistance(meters: number, units: Units): string {
  const m = Math.max(0, meters);
  if (units === "imperial") {
    const feet = m * 3.28084;
    if (feet < 1000) {
      return `${Math.round(feet / 10) * 10} ft`;
    }
    const miles = m / 1609.344;
    return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
  }
  if (m < 1000) {
    return `${m < 100 ? Math.round(m / 5) * 5 : Math.round(m / 10) * 10} m`;
  }
  const km = m / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

export function formatSpeed(mps: number, units: Units): string {
  const kmh = mpsToKmh(Math.max(0, mps));
  return units === "imperial" ? `${Math.round(kmhToMph(kmh))} mph` : `${Math.round(kmh)} km/h`;
}

/** Speed value only, for big dashboard digits. */
export function speedValue(mps: number, units: Units): number {
  const kmh = mpsToKmh(Math.max(0, mps));
  return Math.round(units === "imperial" ? kmhToMph(kmh) : kmh);
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) {
    return `${h} h ${m} min`;
  }
  if (m > 0) {
    return `${m} min`;
  }
  return `${s} s`;
}
