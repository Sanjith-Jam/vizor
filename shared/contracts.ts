export type Point = { lat: number; lon: number };
export type Observation = {
  eventId: string;
  deviceId?: string;
  rideId?: string;
  observedAt: string;
  source: "vision" | "imu" | "manual" | "replay";
  location: Point | null;
  accuracyMeters: number | null;
  confidence: number | null;
  modelRevision?: string;
  gForce?: number;
  evidencePath?: string;
  bbox?: number[];
};
export type Pothole = Point & {
  id: string;
  status: "suspected" | "corroborated" | "disputed" | "repaired";
  sightings: number;
  first_seen: string;
  last_seen: string;
  uncertainty_m: number;
};
export type Telemetry = {
  device_id: string;
  recorded_at: string;
  camera: boolean;
  gps: boolean;
  fps: number | null;
  latency_ms: number | null;
  battery_percent: number | null;
  source: "live" | "replay";
  evidence_path?: string | null;
};
export type PhotoDetection = {
  confidence: number;
  bbox: [number, number, number, number];
};
export type InferenceResult = {
  modelRevision: string;
  inferenceMs: number;
  imageWidth: number;
  imageHeight: number;
  detections: PhotoDetection[];
  annotatedPath?: string;
};
export type InferenceJob = {
  id: string;
  device_id: string;
  evidence_path: string;
  lat: number;
  lon: number;
  mode: "demo" | "report";
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  created_at: string;
  completed_at: string | null;
  attempts: number;
  result: InferenceResult | null;
  error: string | null;
};
export type InferenceState = {
  devices: {
    id: string;
    name: string;
    worker_seen_at: string | null;
    worker_model: string | null;
  }[];
  jobs: InferenceJob[];
  telemetry: Telemetry[];
  observations: {
    id: string;
    event_id: string;
    source: string;
    observed_at: string;
    lat: number | null;
    lon: number | null;
    confidence: number | null;
    pothole_id: string | null;
  }[];
};
export function validateInferenceResult(value: unknown): InferenceResult {
  const r = value as InferenceResult;
  if (
    !r ||
    typeof r.modelRevision !== "string" ||
    !r.modelRevision ||
    r.modelRevision.length > 200 ||
    !Number.isFinite(r.inferenceMs) ||
    r.inferenceMs < 0 ||
    r.inferenceMs > 600000 ||
    !Number.isInteger(r.imageWidth) ||
    r.imageWidth < 1 ||
    r.imageWidth > 8192 ||
    !Number.isInteger(r.imageHeight) ||
    r.imageHeight < 1 ||
    r.imageHeight > 8192 ||
    !Array.isArray(r.detections) ||
    r.detections.length > 20 ||
    r.detections.some(
      (d) =>
        !d ||
        !Number.isFinite(d.confidence) ||
        d.confidence < 0 ||
        d.confidence > 1 ||
        !Array.isArray(d.bbox) ||
        d.bbox.length !== 4 ||
        d.bbox.some((v) => !Number.isFinite(v) || v < 0 || v > 1) ||
        d.bbox[0] >= d.bbox[2] ||
        d.bbox[1] >= d.bbox[3],
    ) ||
    (r.annotatedPath !== undefined &&
      (typeof r.annotatedPath !== "string" ||
        r.annotatedPath.includes("..") ||
        r.annotatedPath.length > 300))
  )
    throw new Error("Invalid pothole inference result.");
  return r;
}
export function inferenceMarkers(
  jobs: InferenceJob[],
  mode: "demo" | "report",
): Pothole[] {
  return jobs
    .filter(
      (j) =>
        j.mode === mode &&
        j.status === "completed" &&
        j.result &&
        j.result.detections.length > 0,
    )
    .map((j) => ({
      id: j.id,
      lat: j.lat,
      lon: j.lon,
      status: "suspected",
      sightings: 1,
      first_seen: j.created_at,
      last_seen: j.completed_at || j.created_at,
      uncertainty_m: 50,
    }));
}
export function deviceOnline(
  telemetry: Telemetry | undefined | null,
  now = Date.now(),
): boolean {
  const age = telemetry ? now - Date.parse(telemetry.recorded_at) : Infinity;
  return age >= -10000 && age < 60000;
}
export function workerOnline(
  device: InferenceState["devices"][number] | undefined,
  now = Date.now(),
): boolean {
  const age = device?.worker_seen_at
    ? now - Date.parse(device.worker_seen_at)
    : Infinity;
  return age >= -10000 && age < 90000;
}
export function photoDemoAlert(job: InferenceJob | undefined): string | null {
  return job?.status === "completed" &&
    job.result &&
    job.result.detections.length > 0
    ? "Demo warning: pothole ahead in 50 metres. Keep your attention on the road."
    : null;
}
export type Place = {
  id: string;
  name: string;
  address: string;
  location: Point;
};
export type RoutePlan = {
  steps: {
    maneuver: { type: string; modifier?: string };
    location: Point;
    roadName: string;
    distance: number;
    instruction: string;
  }[];
  geometry: Point[];
  distance: number;
  duration: number;
};
export const ASSISTANT_ACTIONS = [
  "none",
  "navigate",
  "repeat",
  "mute",
  "unmute",
  "cancel",
  "report",
  "locate",
  "start",
] as const;
export type AssistantReply = {
  transcript: string;
  message: string;
  action: (typeof ASSISTANT_ACTIONS)[number];
  destination?: string;
  /** Place text for "from X to Y" requests; absent means current location. */
  origin?: string;
};
export type AssistantTurn = { role: "user" | "model"; text: string };
/** Compact ride state sent to Gemini; both clients build it the same way. */
export function assistantContext(s: {
  position: Point | null;
  origin?: string | null;
  destination?: Place | null;
  route?: RoutePlan | null;
  nextStepIndex?: number;
  distanceToManeuver?: number | null;
  potholes: Pothole[];
  rideActive: boolean;
  muted: boolean;
  helmet?: unknown;
  demo?: boolean;
}) {
  const r = s.route,
    next = r?.steps[s.nextStepIndex ?? 1];
  return {
    demo: !!s.demo,
    currentLocation: s.position
      ? { lat: +s.position.lat.toFixed(5), lon: +s.position.lon.toFixed(5) }
      : "unknown",
    routeStart: s.origin || "current location",
    destination: s.destination
      ? { name: s.destination.name, address: s.destination.address }
      : null,
    navigationActive: s.rideActive,
    route: r
      ? {
          distanceKm: +(r.distance / 1000).toFixed(1),
          minutes: Math.ceil(r.duration / 60),
          nextInstruction: next?.instruction || null,
          metersToNextTurn:
            s.distanceToManeuver == null
              ? null
              : Math.round(s.distanceToManeuver),
          upcomingSteps: r.steps
            .slice(s.nextStepIndex ?? 1, (s.nextStepIndex ?? 1) + 5)
            .map((x) => x.instruction),
          reportedHazardsOnRoute: routeHazards(r.geometry, s.potholes).length,
          hazardsWithin150m: s.position
            ? upcomingHazards(r.geometry, s.position, s.potholes).length
            : null,
        }
      : null,
    hazardsOnMap: s.potholes.filter((p) => p.status !== "repaired").length,
    voiceMuted: s.muted,
    helmet: s.helmet ?? null,
  };
}
export function validPoint(value: unknown): value is Point {
  const p = value as Point | null;
  return (
    !!p &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lon) <= 180
  );
}
export function validateObservation(value: unknown): Observation {
  const o = value as Observation;
  if (
    !o ||
    typeof o.eventId !== "string" ||
    !/^[\w.-]{1,100}$/.test(o.eventId) ||
    !["vision", "imu", "manual", "replay"].includes(o.source) ||
    typeof o.observedAt !== "string" ||
    !Number.isFinite(Date.parse(o.observedAt)) ||
    Math.abs(Date.now() - Date.parse(o.observedAt)) > 365 * 86400000 ||
    (o.location !== null && !validPoint(o.location)) ||
    (o.accuracyMeters !== null &&
      (!Number.isFinite(o.accuracyMeters) ||
        o.accuracyMeters < 0 ||
        o.accuracyMeters > 10000)) ||
    (o.confidence !== null &&
      (!Number.isFinite(o.confidence) ||
        o.confidence < 0 ||
        o.confidence > 1)) ||
    (o.gForce !== undefined &&
      (!Number.isFinite(o.gForce) || o.gForce < 0 || o.gForce > 655.35)) ||
    (o.modelRevision !== undefined &&
      (typeof o.modelRevision !== "string" || o.modelRevision.length > 200)) ||
    (o.deviceId !== undefined && !/^[\w.-]{1,100}$/.test(o.deviceId)) ||
    (o.evidencePath !== undefined &&
      (typeof o.evidencePath !== "string" ||
        o.evidencePath.length > 300 ||
        o.evidencePath.includes("..")))
  ) {
    throw new Error(
      "Invalid observation. Check event ID, time, GPS, accuracy, and confidence.",
    );
  }
  return o;
}
export function validateReply(value: unknown): AssistantReply {
  const a = value as AssistantReply;
  if (
    !a ||
    typeof a.message !== "string" ||
    a.message.length > 2000 ||
    typeof a.transcript !== "string" ||
    a.transcript.length > 2000 ||
    !ASSISTANT_ACTIONS.includes(a.action) ||
    (a.action === "navigate" &&
      (typeof a.destination !== "string" ||
        !a.destination.trim() ||
        a.destination.length > 200)) ||
    (a.origin != null &&
      (typeof a.origin !== "string" || a.origin.length > 200))
  ) {
    throw new Error("The assistant returned an unsupported action.");
  }
  return a;
}
export function distanceMeters(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dlat = (b.lat - a.lat) * rad,
    dlon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function segmentDistance(p: Point, a: Point, b: Point): number {
  const k = Math.cos((p.lat * Math.PI) / 180),
    x = (b.lon - a.lon) * k,
    y = b.lat - a.lat;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.lon - a.lon) * k * x + (p.lat - a.lat) * y) / (x * x + y * y || 1),
    ),
  );
  return distanceMeters(p, {
    lat: a.lat + t * y,
    lon: a.lon + t * (b.lon - a.lon),
  });
}
export function routeHazards(route: Point[], potholes: Pothole[]): Pothole[] {
  return potholes.filter(
    (p) =>
      p.status !== "repaired" &&
      route.slice(1).some((b, i) => segmentDistance(p, route[i], b) <= 20),
  );
}
export function upcomingHazards(
  route: Point[],
  position: Point,
  potholes: Pothole[],
  aheadMeters = 150,
): Pothole[] {
  if (route.length < 2) return [];
  let closest = Infinity,
    current = 0,
    traversed = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i],
      length = distanceMeters(a, b),
      d = segmentDistance(position, a, b);
    if (d < closest) {
      closest = d;
      current = traversed + Math.min(length, distanceMeters(a, position));
    }
    traversed += length;
  }
  if (closest > 50) return [];
  return routeHazards(route, potholes).filter((p) => {
    let best = Infinity,
      at = 0,
      along = 0;
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1],
        b = route[i],
        len = distanceMeters(a, b),
        d = segmentDistance(p, a, b);
      if (d < best) {
        best = d;
        at = along + Math.min(len, distanceMeters(a, p));
      }
      along += len;
    }
    return at >= current - 5 && at - current <= aheadMeters;
  });
}
export async function flushQueue<T extends { eventId: string }>(
  items: readonly T[],
  send: (item: T) => Promise<void>,
): Promise<T[]> {
  const remaining: T[] = [];
  for (const item of items) {
    try {
      await send(item);
    } catch {
      remaining.push(item);
    }
  }
  return remaining;
}
export function googleRoutes(json: any): RoutePlan[] {
  if (!Array.isArray(json?.routes)) throw new Error("No route found.");
  return json.routes.map((r: any) => {
    const coordinates: Point[] = [];
    let lat = 0,
      lon = 0,
      index = 0;
    const encoded = r.polyline?.encodedPolyline || "";
    while (index < encoded.length) {
      const read = () => {
        let result = 0,
          shift = 0,
          b: number;
        do {
          b = encoded.charCodeAt(index++) - 63;
          result |= (b & 31) << shift;
          shift += 5;
          if (shift > 30 || index > encoded.length)
            throw new Error("Invalid route geometry");
        } while (b >= 32);
        return result & 1 ? ~(result >> 1) : result >> 1;
      };
      lat += read();
      lon += read();
      coordinates.push({ lat: lat / 1e5, lon: lon / 1e5 });
    }
    const raw = (r.legs || []).flatMap((l: any) => l.steps || []);
    const steps = raw.map((s: any, i: number) => {
      const m = s.navigationInstruction?.maneuver || "";
      return {
        maneuver: {
          type: i === 0 ? "depart" : "turn",
          modifier: m.includes("UTURN")
            ? "uturn"
            : m.includes("LEFT")
              ? "left"
              : m.includes("RIGHT")
                ? "right"
                : "straight",
        },
        location: {
          lat: s.startLocation.latLng.latitude,
          lon: s.startLocation.latLng.longitude,
        },
        roadName: "",
        distance: s.distanceMeters || 0,
        instruction:
          s.navigationInstruction?.instructions || "Continue straight",
      };
    });
    const last = raw.at(-1);
    if (last)
      steps.push({
        maneuver: { type: "arrive", modifier: "straight" },
        location: {
          lat: last.endLocation.latLng.latitude,
          lon: last.endLocation.latLng.longitude,
        },
        roadName: "",
        distance: 0,
        instruction: "Arrive at your destination",
      });
    if (coordinates.length < 2 || steps.length < 2)
      throw new Error("The route has no usable navigation geometry.");
    return {
      steps,
      geometry: coordinates,
      distance: r.distanceMeters,
      duration: parseFloat(r.duration),
    };
  });
}

/** Validate route data again at client boundaries before feeding guidance. */
export function validateRoutePlans(value: unknown): RoutePlan[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10)
    throw new Error("No usable Google route was returned.");
  for (const route of value) {
    if (
      !Number.isFinite(route?.distance) ||
      route.distance < 0 ||
      !Number.isFinite(route.duration) ||
      route.duration < 0 ||
      !Array.isArray(route.geometry) ||
      route.geometry.length < 2 ||
      route.geometry.length > 100000 ||
      !route.geometry.every(validPoint) ||
      !Array.isArray(route.steps) ||
      route.steps.length < 2 ||
      !route.steps.every(
        (step: any) =>
          validPoint(step?.location) &&
          Number.isFinite(step.distance) &&
          step.distance >= 0 &&
          typeof step.instruction === "string" &&
          step.instruction.length <= 2000 &&
          typeof step.roadName === "string" &&
          typeof step.maneuver?.type === "string" &&
          (step.maneuver.modifier === undefined ||
            typeof step.maneuver.modifier === "string"),
      )
    ) {
      throw new Error(
        "Google returned incomplete route guidance. Choose the destination again.",
      );
    }
  }
  return value;
}
