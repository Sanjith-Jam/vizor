import {
  distanceMeters,
  routeHazards,
  segmentDistance,
  type Point,
  type Pothole,
} from "./contracts.ts";
import {
  EMPTY_ROAD_CONDITIONS,
  fetchRoadConditions,
  routeSpeedBreakers,
  type Bounds,
  type RoadCondition,
  type RoadConditions,
  type RoadSegment,
  type SpeedBreaker,
} from "./roadConditions.ts";

/**
 * Road context along a whole route (not just the map view): what lies ahead
 * of the rider, how rough each route alternative is, and speed breakers the
 * rider marked themselves.
 */
export type RoadData = RoadConditions & { potholes: Pothole[] };
export type RoadAlertKind = "pothole" | "speed_breaker" | "bad_road";
export type RoadAlert = {
  id: string;
  kind: RoadAlertKind;
  /** Metres along the route from the rider to the hazard. */
  ahead: number;
  message: string;
};
export type RoadStretch = {
  start: number;
  end: number;
  condition: RoadCondition;
  roadId: string;
  name: string;
};
export type RouteRoadReport = {
  potholes: number;
  speedBreakers: number;
  badMeters: number;
  roughMeters: number;
  /** Lower is smoother: rough length plus per-hazard penalties, in metres. */
  score: number;
};

const NEAR_ROUTE_M = 20;
const ON_ROUTE_M = 50;
const ROAD_OVERLAP_M = 12;
const SAMPLE_M = 25;
const MIN_STRETCH_M = 50;
// Route cells are fetched like map views; 0.2° stays under the 0.25° limit.
const CELL_DEG = 0.2;
export const MAX_ROUTE_CELLS = 16;
const MARK_MERGE_M = 15;

export function mergeRoadConditions(
  ...parts: RoadConditions[]
): RoadConditions {
  const breakers = new Map<string, SpeedBreaker>();
  const roads = new Map<string, RoadSegment>();
  for (const part of parts) {
    for (const s of part.speedBreakers)
      if (!breakers.has(s.id)) breakers.set(s.id, s);
    for (const r of part.roads) {
      const seen = roads.get(r.id);
      if (!seen || (seen.condition === "fair" && r.condition === "poor"))
        roads.set(r.id, r);
    }
  }
  return { speedBreakers: [...breakers.values()], roads: [...roads.values()] };
}

/** The 0.2° grid cells a set of routes passes through, in route order. */
export function routeCells(routes: Point[][]): Bounds[] {
  const cells = new Map<string, Bounds>();
  const cell = (v: number) => Math.floor(v / CELL_DEG);
  const edge = (i: number) => +(i * CELL_DEG).toFixed(4);
  for (const route of routes)
    for (let i = 0; i < route.length; i++) {
      // Interpolate long segments so a straight highway still covers each cell.
      const a = route[Math.max(0, i - 1)],
        b = route[i];
      const steps = Math.max(1, Math.ceil(distanceMeters(a, b) / 5000));
      for (let k = 1; k <= steps; k++) {
        const lat = a.lat + ((b.lat - a.lat) * k) / steps,
          lon = a.lon + ((b.lon - a.lon) * k) / steps;
        const y = cell(lat),
          x = cell(lon);
        const key = `${y}:${x}`;
        if (!cells.has(key))
          cells.set(key, {
            south: edge(y),
            north: edge(y + 1),
            west: edge(x),
            east: edge(x + 1),
          });
      }
    }
  return [...cells.values()];
}

/**
 * Speed breakers and rough roads along routes, fetched cell by cell (two at a
 * time, to stay polite to the public Overpass servers). Very long routes are
 * covered from the start, up to MAX_ROUTE_CELLS cells.
 */
export async function fetchRouteConditions(
  routes: Point[][],
  potholes: Pothole[],
  signal?: AbortSignal,
): Promise<RoadConditions & { complete: boolean }> {
  const cells = routeCells(routes);
  const queue = cells.slice(0, MAX_ROUTE_CELLS);
  const results: RoadConditions[] = [];
  let failed = 0;
  const worker = async () => {
    for (let cell = queue.shift(); cell; cell = queue.shift()) {
      if (signal?.aborted) return;
      results.push(
        await fetchRoadConditions(cell, potholes, signal).catch(() => {
          failed++;
          return EMPTY_ROAD_CONDITIONS;
        }),
      );
    }
  };
  await Promise.all([worker(), worker()]);
  if (signal?.aborted) throw new Error("Route conditions request cancelled.");
  if (failed && failed === results.length)
    throw new Error("Road conditions are unavailable right now.");
  return {
    ...mergeRoadConditions(...results),
    // Partial when the route is longer than the cell budget or a cell failed.
    complete: cells.length <= MAX_ROUTE_CELLS && !failed,
  };
}

function cumulative(route: Point[]) {
  const offsets = [0];
  for (let i = 1; i < route.length; i++)
    offsets.push(offsets[i - 1] + distanceMeters(route[i - 1], route[i]));
  return offsets;
}

/** Where a point sits along the route: offset from the start, and how far
 * off the line it is. */
function locate(route: Point[], offsets: number[], p: Point) {
  let off = Infinity,
    offset = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i],
      d = segmentDistance(p, a, b);
    if (d < off) {
      off = d;
      offset =
        offsets[i - 1] +
        Math.min(offsets[i] - offsets[i - 1], distanceMeters(a, p));
    }
  }
  return { offset, off };
}

// Flat-earth bearing in radians, good enough to compare nearby segments.
function heading(a: Point, b: Point) {
  const k = Math.cos((a.lat * Math.PI) / 180);
  return Math.atan2(b.lat - a.lat, (b.lon - a.lon) * k);
}
const parallel = (a: number, b: number) => Math.abs(Math.cos(a - b)) > 0.85;

/**
 * Stretches of the route that run along a rough or bad road. Roads that only
 * cross the route are ignored by requiring the two lines to run parallel.
 */
export function roadStretches(
  route: Point[],
  roads: RoadSegment[],
): RoadStretch[] {
  if (route.length < 2 || !roads.length) return [];
  const pad = 0.0002;
  const boxes = roads.map((r) => {
    let s = Infinity,
      n = -Infinity,
      w = Infinity,
      e = -Infinity;
    for (const p of r.path) {
      s = Math.min(s, p.lat);
      n = Math.max(n, p.lat);
      w = Math.min(w, p.lon);
      e = Math.max(e, p.lon);
    }
    return { s: s - pad, n: n + pad, w: w - pad, e: e + pad };
  });
  const offsets = cumulative(route);
  const stretches: RoadStretch[] = [];
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i],
      length = offsets[i] - offsets[i - 1];
    if (!length) continue;
    const dir = heading(a, b);
    const pieces = Math.max(1, Math.ceil(length / SAMPLE_M));
    for (let k = 0; k < pieces; k++) {
      const t = (k + 0.5) / pieces;
      const p = {
        lat: a.lat + (b.lat - a.lat) * t,
        lon: a.lon + (b.lon - a.lon) * t,
      };
      let match: RoadSegment | null = null;
      for (let r = 0; r < roads.length && match?.condition !== "poor"; r++) {
        const road = roads[r],
          box = boxes[r];
        if (p.lat < box.s || p.lat > box.n || p.lon < box.w || p.lon > box.e)
          continue;
        for (let j = 1; j < road.path.length; j++)
          if (
            segmentDistance(p, road.path[j - 1], road.path[j]) <=
              ROAD_OVERLAP_M &&
            parallel(dir, heading(road.path[j - 1], road.path[j]))
          ) {
            if (!match || road.condition === "poor") match = road;
            break;
          }
      }
      const start = offsets[i - 1] + (length * k) / pieces,
        end = start + length / pieces;
      const last = stretches.at(-1);
      if (!match) continue;
      const found = match;
      if (
        last &&
        last.condition === found.condition &&
        start - last.end < SAMPLE_M
      )
        last.end = end;
      else
        stretches.push({
          start,
          end,
          condition: found.condition,
          roadId: found.id,
          name: found.name,
        });
    }
  }
  return stretches.filter((s) => s.end - s.start >= MIN_STRETCH_M);
}

const roundTo = (m: number, step: number) =>
  Math.max(step, Math.round(m / step) * step);

/** Hazards within `aheadMeters` of the rider along the route, nearest first. */
export function upcomingRoadAlerts(
  route: Point[],
  position: Point,
  data: RoadData,
  aheadMeters = 150,
): RoadAlert[] {
  if (route.length < 2) return [];
  const offsets = cumulative(route);
  const me = locate(route, offsets, position);
  if (me.off > ON_ROUTE_M) return [];
  const alerts: RoadAlert[] = [];
  const ahead = (p: Point) => {
    const at = locate(route, offsets, p);
    const d = at.offset - me.offset;
    return at.off <= NEAR_ROUTE_M && d >= -5 && d <= aheadMeters
      ? Math.max(0, d)
      : null;
  };
  for (const p of data.potholes) {
    if (p.status === "repaired") continue;
    const d = ahead(p);
    if (d !== null)
      alerts.push({
        id: `pothole:${p.id}`,
        kind: "pothole",
        ahead: d,
        message: "Reported pothole ahead. Stay aware.",
      });
  }
  for (const s of data.speedBreakers) {
    const d = ahead(s);
    if (d !== null)
      alerts.push({
        id: `breaker:${s.id}`,
        kind: "speed_breaker",
        ahead: d,
        message:
          d < 30
            ? `${s.kind} now. Slow down.`
            : `${s.kind} in ${roundTo(d, 10)} metres. Slow down.`,
      });
  }
  for (const s of roadStretches(route, data.roads)) {
    if (s.condition !== "poor") continue;
    const d = s.start - me.offset;
    if (d >= -5 && d <= aheadMeters)
      alerts.push({
        id: `road:${s.roadId}`,
        kind: "bad_road",
        ahead: Math.max(0, d),
        message: `Bad road ahead for about ${roundTo(s.end - s.start, 50)} metres. Ride carefully.`,
      });
  }
  return alerts.sort((a, b) => a.ahead - b.ahead);
}

export function routeRoadReport(
  route: Point[],
  data: RoadData,
): RouteRoadReport {
  const potholes = routeHazards(route, data.potholes).length;
  const speedBreakers = routeSpeedBreakers(
    route,
    data.speedBreakers,
    NEAR_ROUTE_M,
  ).length;
  let badMeters = 0,
    roughMeters = 0;
  for (const s of roadStretches(route, data.roads))
    if (s.condition === "poor") badMeters += s.end - s.start;
    else roughMeters += s.end - s.start;
  return {
    potholes,
    speedBreakers,
    badMeters,
    roughMeters,
    score: badMeters + 0.4 * roughMeters + 150 * potholes + 40 * speedBreakers,
  };
}

/** Index of the clearly smoothest alternative, or null when they are close. */
export function smoothestRoute(reports: RouteRoadReport[]): number | null {
  if (reports.length < 2) return null;
  let best = 0;
  reports.forEach((r, i) => {
    if (r.score < reports[best].score) best = i;
  });
  const worst = Math.max(...reports.map((r) => r.score));
  return worst - reports[best].score >= 100 ? best : null;
}

const km = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${roundTo(m, 50)} m`;
export function describeRoadReport(r: RouteRoadReport): string {
  const parts = [
    r.speedBreakers &&
      `${r.speedBreakers} speed breaker${r.speedBreakers === 1 ? "" : "s"}`,
    r.badMeters && `${km(r.badMeters)} bad road`,
    r.roughMeters && `${km(r.roughMeters)} rough road`,
  ].filter(Boolean);
  return parts.length
    ? parts.join(" · ")
    : "No mapped speed breakers or bad roads";
}

/** Adds a rider-marked speed breaker unless one is already within 15 m. */
export function markSpeedBreaker(
  marked: SpeedBreaker[],
  at: Point,
  known: SpeedBreaker[] = [],
  now = Date.now(),
): SpeedBreaker[] {
  if ([...marked, ...known].some((s) => distanceMeters(s, at) <= MARK_MERGE_M))
    return marked;
  return [
    ...marked,
    {
      id: `m${now}`,
      lat: +at.lat.toFixed(6),
      lon: +at.lon.toFixed(6),
      kind: "Speed breaker",
      source: "rider",
    },
  ];
}

export function parseMarkedSpeedBreakers(raw: string | null): SpeedBreaker[] {
  try {
    const list = JSON.parse(raw || "[]");
    return Array.isArray(list)
      ? list.filter(
          (s) =>
            s &&
            typeof s.id === "string" &&
            Number.isFinite(s.lat) &&
            Number.isFinite(s.lon),
        )
      : [];
  } catch {
    return [];
  }
}

export const MARKED_SPEED_BREAKERS_KEY = "vizor.marked-speed-breakers.v1";
export const ROUTE_ROAD_KEY = "vizor.route-road.v1";
export const SHARED_SPEED_BREAKERS_KEY = "vizor.shared-speed-breakers.v1";

/** Opens the OpenStreetMap editor at a point so riders can map it properly. */
export const osmEditUrl = (p: Point) =>
  `https://www.openstreetmap.org/edit#map=19/${p.lat.toFixed(6)}/${p.lon.toFixed(6)}`;

const OSM_API = "https://api.openstreetmap.org/api/0.6";
/**
 * Leaves a public OpenStreetMap note so local mappers can add the speed
 * breaker for every OSM-based app. Only call this after the rider confirms.
 */
export async function shareSpeedBreakerNote(
  at: Point,
  api = OSM_API,
): Promise<string> {
  const body = new URLSearchParams({
    lat: at.lat.toFixed(6),
    lon: at.lon.toFixed(6),
    text:
      "Speed breaker (speed bump) on the road here, reported by a rider " +
      "with the Vizor riding app. If confirmed, it can be mapped as a node " +
      "on the road with traffic_calming=bump.",
  });
  const response = await fetch(`${api}/notes.json`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!response.ok)
    throw new Error(
      `OpenStreetMap did not accept the note (${response.status}).`,
    );
  const note = (await response.json()) as { properties?: { id?: number } };
  const id = note.properties?.id;
  if (!id) throw new Error("OpenStreetMap returned no note id.");
  return `https://www.openstreetmap.org/note/${id}`;
}
