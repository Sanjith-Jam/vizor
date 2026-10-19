/**
 * Hazard log + ride history records. Pure (no AsyncStorage) so the
 * list-capping and CSV export are unit-tested in records.test.ts.
 */

import { HazardEventType, type HazardEvent } from "../protocol/hazardProtocol";

export interface HazardRecord {
  id: string;
  at: number;
  type: HazardEventType;
  gForce: number;
  lat: number;
  lon: number;
  hasGpsFix: boolean;
}

export interface RideRecord {
  id: string;
  startedAt: number;
  endedAt: number;
  distanceMeters: number;
  maxSpeedMps: number;
  destination: string | null;
  hazardCount: number;
}

export const MAX_HAZARDS = 500;
export const MAX_RIDES = 200;

export const HAZARD_LABEL: Record<HazardEventType, string> = {
  [HazardEventType.POTHOLE_BUMP]: "Pothole / bump",
  [HazardEventType.CRASH_DETECTED]: "Crash detected",
  [HazardEventType.SOS_CANCELLED]: "SOS cancelled",
};

export function hazardRecordFrom(event: HazardEvent, at: number): HazardRecord {
  return { id: `${at}-${event.type}`, at, ...event };
}

/** Newest first, capped so storage can't grow forever. */
export function prepend<T>(list: readonly T[], item: T, cap: number): T[] {
  return [item, ...list].slice(0, cap);
}

function csvCell(value: string | number | boolean): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function hazardsToCsv(records: readonly HazardRecord[]): string {
  const header = "time_iso,type,g_force,lat,lon,has_gps_fix";
  const rows = records.map((r) =>
    [
      new Date(r.at).toISOString(),
      HAZARD_LABEL[r.type] ?? r.type,
      r.gForce.toFixed(2),
      r.lat,
      r.lon,
      r.hasGpsFix,
    ]
      .map(csvCell)
      .join(","),
  );
  return [header, ...rows].join("\n");
}

export interface RideTotals {
  rides: number;
  distanceMeters: number;
  durationSeconds: number;
  maxSpeedMps: number;
}

export function rideTotals(rides: readonly RideRecord[]): RideTotals {
  return rides.reduce<RideTotals>(
    (acc, r) => ({
      rides: acc.rides + 1,
      distanceMeters: acc.distanceMeters + r.distanceMeters,
      durationSeconds:
        acc.durationSeconds + Math.max(0, (r.endedAt - r.startedAt) / 1000),
      maxSpeedMps: Math.max(acc.maxSpeedMps, r.maxSpeedMps),
    }),
    { rides: 0, distanceMeters: 0, durationSeconds: 0, maxSpeedMps: 0 },
  );
}

export function parseList<T extends { id: string }>(raw: string | null): T[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? (parsed.filter((x) => x && typeof x.id === "string") as T[])
      : [];
  } catch {
    return [];
  }
}

/** Calendar-week activity from saved rides; an empty log stays zero. */
export function weeklyActivity(
  rides: readonly RideRecord[],
  week: 0 | -1,
  now = new Date(),
) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + week * 7);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(date.getDate() + index);
    return { date, distanceMeters: 0, rides: 0 };
  });
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  let distanceMeters = 0,
    count = 0,
    durationSeconds = 0;
  for (const ride of rides) {
    if (
      !Number.isFinite(ride.startedAt) ||
      !Number.isFinite(ride.distanceMeters) ||
      ride.distanceMeters < 0 ||
      ride.startedAt < start.getTime() ||
      ride.startedAt >= end.getTime() ||
      ride.startedAt > now.getTime()
    )
      continue;
    const index = (new Date(ride.startedAt).getDay() + 6) % 7;
    days[index].distanceMeters += ride.distanceMeters;
    days[index].rides++;
    count++;
    distanceMeters += ride.distanceMeters;
    if (Number.isFinite(ride.endedAt))
      durationSeconds += Math.max(0, (ride.endedAt - ride.startedAt) / 1000);
  }
  return { days, rides: count, distanceMeters, durationSeconds };
}
