import {
  distanceMeters,
  segmentDistance,
  type Point,
  type Pothole,
} from "./contracts.ts";

/**
 * Real-world road context for the maps. Speed breakers and road surface come
 * from OpenStreetMap (Overpass API, © OpenStreetMap contributors, ODbL); a road
 * is flagged as generally bad from its mapped surface/smoothness or from the
 * density of active Vizor pothole reports along it.
 */
export type Bounds = {
  south: number;
  north: number;
  west: number;
  east: number;
};
export type SpeedBreaker = Point & {
  id: string;
  kind: string;
  /** "rider" for speed breakers the rider marked on this device. */
  source?: "osm" | "rider" | "shared";
};
export type RoadCondition = "fair" | "poor";
export type RoadSegment = {
  id: string;
  name: string;
  path: Point[];
  condition: RoadCondition;
  reasons: string[];
};
export type RoadConditions = {
  speedBreakers: SpeedBreaker[];
  roads: RoadSegment[];
};
export const EMPTY_ROAD_CONDITIONS: RoadConditions = {
  speedBreakers: [],
  roads: [],
};
export const ROAD_CONDITION_COLORS: Record<RoadCondition, string> = {
  fair: "#F97316",
  poor: "#9F1239",
};
export const SPEED_BREAKER_COLOR = "#FACC15";
/** Shared (server) speed breakers as map/alert entries. */
export function sharedSpeedBreakers(
  rows: { id: string; lat: number; lon: number; status: string }[],
): SpeedBreaker[] {
  return rows
    .filter(
      (r) =>
        (r.status === "confirmed" || r.status === "suspected") &&
        Number.isFinite(r.lat) &&
        Number.isFinite(r.lon),
    )
    .map((r) => ({
      id: `s${r.id}`,
      lat: r.lat,
      lon: r.lon,
      kind:
        r.status === "confirmed" ? "Speed breaker" : "Possible speed breaker",
      source: "shared",
    }));
}
export const OSM_ATTRIBUTION = "Road data © OpenStreetMap contributors";

const SPEED_BREAKER_KINDS: Record<string, string> = {
  yes: "Speed breaker",
  bump: "Speed breaker",
  mini_bumps: "Speed breakers",
  hump: "Speed hump",
  table: "Raised crossing",
  cushion: "Speed cushion",
  rumble_strip: "Rumble strip",
  dip: "Dip",
  double_dip: "Dip",
};
const SMOOTHNESS: Record<string, RoadCondition> = {
  intermediate: "fair",
  bad: "poor",
  very_bad: "poor",
  horrible: "poor",
  very_horrible: "poor",
  impassable: "poor",
};
const SURFACE: Record<string, RoadCondition> = {
  unpaved: "fair",
  gravel: "fair",
  fine_gravel: "fair",
  compacted: "fair",
  pebblestone: "fair",
  cobblestone: "fair",
  unhewn_cobblestone: "fair",
  sett: "fair",
  dirt: "poor",
  earth: "poor",
  ground: "poor",
  mud: "poor",
  sand: "poor",
  grass: "poor",
  rock: "poor",
};
// Roads a two-wheeler rides on; farm tracks and footpaths would flood the map.
const RIDEABLE =
  "^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road)(_link)?$";
const POTHOLE_MATCH_M = 20;
const MAX_POTHOLE_PROBES = 150;
// Larger views are skipped: Overpass is a shared public service.
export const ROAD_CONDITIONS_MAX_SPAN_DEG = 0.25;
export const roadConditionsAvailable = (view: Bounds) =>
  view.north - view.south <= ROAD_CONDITIONS_MAX_SPAN_DEG &&
  view.east - view.west <= ROAD_CONDITIONS_MAX_SPAN_DEG;
// Mapped road features change slowly; public Overpass can take 10–40 s.
const CACHE_MS = 12 * 60 * 60 * 1000;
const ENDPOINT_TIMEOUT_MS = 50000;
export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

type OsmElement = {
  type: "node" | "way";
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
};

const active = (p: Pothole) =>
  p.status === "suspected" || p.status === "corroborated";
const words = (v: string) => v.replace(/_/g, " ");

/** Snaps a view outward to a grid so small pans reuse the cached response. */
export function snapBounds(b: Bounds, step = 0.02): Bounds {
  const down = (v: number) => +(Math.floor(v / step) * step).toFixed(4);
  const up = (v: number) => +(Math.ceil(v / step) * step).toFixed(4);
  return {
    south: down(b.south),
    west: down(b.west),
    north: up(b.north),
    east: up(b.east),
  };
}

const inside = (p: Point, b: Bounds) =>
  p.lat >= b.south && p.lat <= b.north && p.lon >= b.west && p.lon <= b.east;

/** Potholes worth probing for nearby roads, in a stable order for caching. */
function probes(bounds: Bounds, potholes: Pothole[]): Point[] {
  return potholes
    .filter((p) => active(p) && inside(p, bounds))
    .map((p) => ({ lat: +p.lat.toFixed(5), lon: +p.lon.toFixed(5) }))
    .sort((a, b) => a.lat - b.lat || a.lon - b.lon)
    .slice(0, MAX_POTHOLE_PROBES);
}

const boxOf = (b: Bounds) => `${b.south},${b.west},${b.north},${b.east}`;

/** Mapped speed breakers and rough-surface roads in an area. */
export function tagQuery(bounds: Bounds): string {
  const box = boxOf(bounds);
  const calming = `^(${Object.keys(SPEED_BREAKER_KINDS).join("|")})$`;
  const smooth = `^(${Object.keys(SMOOTHNESS).join("|")})$`;
  const rough = `^(${Object.keys(SURFACE).join("|")})$`;
  const road = `way["highway"~"${RIDEABLE}"]`;
  return (
    `[out:json][timeout:25];(` +
    `node["traffic_calming"~"${calming}"](${box});` +
    `${road}["traffic_calming"~"${calming}"](${box});` +
    `${road}["smoothness"~"${smooth}"](${box});` +
    `${road}["surface"~"${rough}"](${box});` +
    `);out tags geom;`
  );
}

/** Roads passing pothole reports, so report density can rate them. Kept
 * separate from the tag query so that one stays cached as reports change. */
export function probeQuery(bounds: Bounds, near: Point[]): string {
  const box = boxOf(bounds);
  return (
    `[out:json][timeout:25];(` +
    near
      .map(
        (p) =>
          `way(${box})(around:${POTHOLE_MATCH_M},${p.lat},${p.lon})["highway"~"${RIDEABLE}"];`,
      )
      .join("") +
    `);out tags geom;`
  );
}

function pathLength(path: Point[]) {
  let m = 0;
  for (let i = 1; i < path.length; i++)
    m += distanceMeters(path[i - 1], path[i]);
  return m;
}

/** Why a road is generally bad, or null when nothing marks it as rough. */
export function rateRoad(
  tags: Record<string, string>,
  path: Point[],
  potholes: Pothole[],
): Pick<RoadSegment, "condition" | "reasons"> | null {
  const reasons: string[] = [];
  let condition: RoadCondition | null = null;
  const worse = (c: RoadCondition | undefined, reason: string) => {
    if (!c) return;
    reasons.push(reason);
    if (condition !== "poor") condition = c;
  };
  if (tags.smoothness)
    worse(SMOOTHNESS[tags.smoothness], `${words(tags.smoothness)} surface`);
  if (tags.surface) worse(SURFACE[tags.surface], `${words(tags.surface)} road`);
  if (path.length > 1) {
    const hits = potholes.filter(
      (p) =>
        active(p) &&
        path
          .slice(1)
          .some((b, i) => segmentDistance(p, path[i], b) <= POTHOLE_MATCH_M),
    ).length;
    const perKm = hits / Math.max(pathLength(path) / 1000, 0.1);
    const label = `${hits} pothole reports`;
    if (hits >= 3 && perKm >= 3) worse("poor", label);
    else if (hits >= 2 && perKm >= 2) worse("fair", label);
  }
  return condition ? { condition, reasons } : null;
}

export function parseRoadConditions(
  elements: OsmElement[],
  potholes: Pothole[],
): RoadConditions {
  const speedBreakers = new Map<string, SpeedBreaker>();
  const roads = new Map<string, RoadSegment>();
  for (const e of elements) {
    const tags = e.tags || {};
    const kind = SPEED_BREAKER_KINDS[tags.traffic_calming];
    if (
      e.type === "node" &&
      kind &&
      Number.isFinite(e.lat) &&
      Number.isFinite(e.lon)
    )
      speedBreakers.set(`n${e.id}`, {
        id: `n${e.id}`,
        lat: e.lat!,
        lon: e.lon!,
        kind,
      });
    if (e.type !== "way" || !e.geometry?.length) continue;
    const path = e.geometry
      .filter((g) => Number.isFinite(g.lat) && Number.isFinite(g.lon))
      .map((g) => ({ lat: g.lat, lon: g.lon }));
    if (!path.length) continue;
    if (kind) {
      const mid = path[Math.floor(path.length / 2)];
      speedBreakers.set(`w${e.id}`, { id: `w${e.id}`, ...mid, kind });
    }
    const rating = rateRoad(tags, path, potholes);
    if (rating)
      roads.set(`w${e.id}`, {
        id: `w${e.id}`,
        name: tags.name || tags.ref || "Unnamed road",
        path,
        ...rating,
      });
  }
  return {
    speedBreakers: [...speedBreakers.values()],
    roads: [...roads.values()],
  };
}

/** Speed breakers within `meters` of a route line. */
export function routeSpeedBreakers(
  route: Point[],
  speedBreakers: SpeedBreaker[],
  meters = 20,
): SpeedBreaker[] {
  return speedBreakers.filter((s) =>
    route.slice(1).some((b, i) => segmentDistance(s, route[i], b) <= meters),
  );
}

const cache = new Map<
  string,
  { at: number; elements: Promise<OsmElement[]> }
>();
const STORE_PREFIX = "vizor.road.";
const storeKey = (query: string) => {
  let h = 5381;
  for (let i = 0; i < query.length; i++) h = (h * 33) ^ query.charCodeAt(i);
  return STORE_PREFIX + (h >>> 0).toString(36);
};
/** Browser-only persistence so a reload does not wait on Overpass again. */
const store = (() => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
})();
function readStored(query: string) {
  try {
    const saved = JSON.parse(store?.getItem(storeKey(query)) || "null");
    if (
      saved &&
      Date.now() - saved.at < CACHE_MS &&
      Array.isArray(saved.elements)
    )
      return saved as { at: number; elements: OsmElement[] };
  } catch {}
  return null;
}
function writeStored(query: string, elements: OsmElement[]) {
  if (!store) return;
  const value = JSON.stringify({ at: Date.now(), elements });
  try {
    store.setItem(storeKey(query), value);
  } catch {
    try {
      // Quota reached: drop older road snapshots and retry once.
      for (let i = store.length - 1; i >= 0; i--) {
        const k = store.key(i);
        if (k?.startsWith(STORE_PREFIX)) store.removeItem(k);
      }
      store.setItem(storeKey(query), value);
    } catch {}
  }
}

async function overpass(query: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  // overpass-api.de rejects default HTTP-library agents; browsers send their
  // own (and forbid overriding it), React Native needs one set explicitly.
  if (typeof document === "undefined")
    headers["User-Agent"] = "Vizor/1.4 (road conditions)";
  let failure: unknown = new Error("No Overpass endpoint responded.");
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ENDPOINT_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Overpass ${response.status}`);
      const data = (await response.json()) as { elements?: OsmElement[] };
      if (!Array.isArray(data.elements))
        throw new Error("Overpass returned no elements.");
      return data.elements;
    } catch (e) {
      failure = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw failure;
}

/** Speed breakers and rough roads for a map view. Wide views return empty. */
export async function fetchRoadConditions(
  view: Bounds,
  potholes: Pothole[],
  signal?: AbortSignal,
): Promise<RoadConditions> {
  if (!roadConditionsAvailable(view)) return EMPTY_ROAD_CONDITIONS;
  const bounds = snapBounds(view);
  const near = probes(bounds, potholes);
  const [tagged, probed] = await Promise.all([
    cachedOverpass(tagQuery(bounds), { kind: "tags", bounds }),
    near.length
      ? cachedOverpass(probeQuery(bounds, near), {
          kind: "probe",
          bounds,
          near,
        })
      : [],
  ]);
  if (signal?.aborted) throw new Error("Road conditions request cancelled.");
  return parseRoadConditions([...tagged, ...probed], potholes);
}

export type RoadDataRequest = {
  kind: "tags" | "probe";
  bounds: Bounds;
  near?: Point[];
};
let proxy: ((request: RoadDataRequest) => Promise<unknown[]>) | null = null;
/**
 * Routes Overpass lookups through the Vizor API's shared cache when the rider
 * is signed in; direct public Overpass stays the fallback.
 */
export function setRoadDataProxy(
  fn: ((request: RoadDataRequest) => Promise<unknown[]>) | null,
) {
  proxy = fn;
}
async function fetchElements(query: string, request: RoadDataRequest) {
  if (proxy)
    try {
      return (await proxy(request)) as OsmElement[];
    } catch {}
  return overpass(query);
}

function cachedOverpass(
  query: string,
  request: RoadDataRequest,
): Promise<OsmElement[]> {
  let hit = cache.get(query);
  // The shared request is not tied to one caller's signal, so a view that is
  // panned away from still fills the cache for when the rider returns.
  if (!hit || Date.now() - hit.at > CACHE_MS) {
    const saved = readStored(query);
    hit = saved
      ? { at: saved.at, elements: Promise.resolve(saved.elements) }
      : {
          at: Date.now(),
          elements: fetchElements(query, request).then((elements) => {
            writeStored(query, elements);
            return elements;
          }),
        };
    cache.set(query, hit);
    hit.elements.catch(() => cache.delete(query));
  }
  return hit.elements;
}

/**
 * Debounced loader for a map component: call `request` whenever the view or
 * potholes change; `onData` receives the latest result. Failures keep the
 * previous overlay, since it is supplementary to the pothole layer.
 */
export function createRoadConditionsFeed(
  onData: (data: RoadConditions) => void,
  delayMs = 700,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    controller?.abort();
    controller = null;
  };
  return {
    request(view: Bounds | null, potholes: Pothole[]) {
      cancel();
      if (!view) return;
      timer = setTimeout(() => {
        const current = (controller = new AbortController());
        fetchRoadConditions(view, potholes, current.signal)
          .then((data) => {
            if (!current.signal.aborted) onData(data);
          })
          .catch(() => {});
      }, delayMs);
    },
    dispose: cancel,
  };
}
