/**
 * OSRM route parsing + live progress along a route. Pure (no fetch, no RN)
 * so the turn-by-turn logic is unit-tested in route.test.ts; osrmClient.ts
 * does the network part.
 */

import {
  directionFromOsrm,
  NavigationDirection,
  type OsrmManeuver,
} from "../protocol/navigationProtocol";
import { distanceToPolylineMeters, haversineMeters, type LatLon } from "./geo";

export interface RouteStep {
  maneuver: OsrmManeuver;
  location: LatLon;
  roadName: string;
  /** Length of this step (from its maneuver to the next one), metres. */
  distance: number;
  instruction: string;
}

export interface Route {
  steps: RouteStep[];
  geometry: LatLon[];
  distance: number;
  duration: number;
}

/** Within this many metres of a maneuver point, it counts as done. */
export const MANEUVER_REACHED_M = 25;
/** Further than this from the route line = off route. */
export const OFF_ROUTE_M = 45;

export function instructionFor(
  maneuver: OsrmManeuver,
  roadName: string,
): string {
  const onto = roadName ? ` onto ${roadName}` : "";
  const dir = directionFromOsrm(maneuver);
  switch (dir) {
    case NavigationDirection.DESTINATION:
      return "Arrive at your destination";
    case NavigationDirection.U_TURN:
      return `Make a U-turn${onto}`;
    case NavigationDirection.LEFT:
      return `${maneuver.modifier?.includes("slight") ? "Bear" : "Turn"} left${onto}`;
    case NavigationDirection.RIGHT:
      return `${maneuver.modifier?.includes("slight") ? "Bear" : "Turn"} right${onto}`;
    default:
      return maneuver.type === "depart"
        ? `Head out${roadName ? ` on ${roadName}` : ""}`
        : `Continue straight${onto}`;
  }
}

type OsrmJson = {
  code?: string;
  message?: string;
  routes?: {
    distance: number;
    duration: number;
    geometry?: { coordinates?: [number, number][] };
    legs?: {
      steps?: {
        distance: number;
        name?: string;
        maneuver: {
          type: string;
          modifier?: string;
          location: [number, number];
        };
      }[];
    }[];
  }[];
};

export function parseOsrmRoute(json: unknown): Route {
  const data = json as OsrmJson;
  if (data?.code !== "Ok" || !data.routes?.length) {
    throw new Error(data?.message || "No route found to that destination.");
  }
  const r = data.routes[0];
  const coordinate = (p: unknown): p is [number, number] =>
    Array.isArray(p) &&
    p.length === 2 &&
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1]) &&
    Math.abs(p[0]) <= 180 &&
    Math.abs(p[1]) <= 90;
  if (
    !Number.isFinite(r.distance) ||
    r.distance < 0 ||
    !Number.isFinite(r.duration) ||
    r.duration < 0 ||
    !Array.isArray(r.geometry?.coordinates) ||
    r.geometry.coordinates.length < 2 ||
    !r.geometry.coordinates.every(coordinate)
  ) {
    throw new Error("The routing service returned invalid route geometry.");
  }
  const steps: RouteStep[] = [];
  for (const leg of r.legs ?? []) {
    for (const s of leg.steps ?? []) {
      if (
        !coordinate(s.maneuver?.location) ||
        typeof s.maneuver.type !== "string" ||
        (s.maneuver.modifier !== undefined &&
          typeof s.maneuver.modifier !== "string") ||
        (s.name !== undefined && typeof s.name !== "string") ||
        !Number.isFinite(s.distance) ||
        s.distance < 0
      )
        throw new Error(
          "The routing service returned invalid navigation steps.",
        );
      const maneuver = { type: s.maneuver.type, modifier: s.maneuver.modifier };
      const roadName = s.name ?? "";
      steps.push({
        maneuver,
        location: { lon: s.maneuver.location[0], lat: s.maneuver.location[1] },
        roadName,
        distance: s.distance,
        instruction: instructionFor(maneuver, roadName),
      });
    }
  }
  if (steps.length < 2)
    throw new Error("The routing service returned no usable navigation steps.");
  const geometry = (r.geometry?.coordinates ?? []).map(([lon, lat]) => ({
    lat,
    lon,
  }));
  return { steps, geometry, distance: r.distance, duration: r.duration };
}

export interface RouteProgress {
  /** Index of the step whose maneuver the rider is heading toward. */
  nextStepIndex: number;
  direction: NavigationDirection;
  distanceToManeuver: number;
  /** Straight-line to the maneuver + every remaining step's length. */
  distanceRemaining: number;
  offRoute: boolean;
  arrived: boolean;
}

/**
 * Where the rider is along the route. `prevNextStepIndex` keeps progress
 * monotonic - a GPS wobble near an old maneuver mustn't send it backwards.
 */
export function computeProgress(
  route: Route,
  pos: LatLon,
  prevNextStepIndex = 1,
): RouteProgress {
  const last = route.steps.length - 1;
  let next = Math.min(Math.max(1, prevNextStepIndex), Math.max(1, last));

  while (
    next < last &&
    haversineMeters(pos, route.steps[next].location) < MANEUVER_REACHED_M
  ) {
    next += 1;
  }

  const target = route.steps[next] ?? route.steps[last];
  const distanceToManeuver = target ? haversineMeters(pos, target.location) : 0;
  let distanceRemaining = distanceToManeuver;
  for (let i = next; i < route.steps.length; i++) {
    distanceRemaining += route.steps[i].distance;
  }

  const arrived = next >= last && distanceToManeuver < MANEUVER_REACHED_M;
  return {
    nextStepIndex: next,
    direction: arrived
      ? NavigationDirection.DESTINATION
      : target
        ? directionFromOsrm(target.maneuver)
        : NavigationDirection.STRAIGHT,
    distanceToManeuver,
    distanceRemaining,
    offRoute:
      !arrived && distanceToPolylineMeters(pos, route.geometry) > OFF_ROUTE_M,
    arrived,
  };
}

/** Distance bands (m) at which a maneuver is announced by voice, largest first. */
export const PROMPT_BANDS = [500, 200, 50] as const;

/**
 * Which voice band (if any) the rider has just entered. `alreadyAnnounced`
 * holds bands already spoken for this maneuver.
 */
export function promptBandFor(
  distance: number,
  alreadyAnnounced: ReadonlySet<number>,
): number | null {
  let band: number | null = null;
  for (const b of PROMPT_BANDS) {
    if (distance <= b) {
      band = b;
    }
  }
  return band !== null && !alreadyAnnounced.has(band) ? band : null;
}
