import type { Point, Pothole } from "./contracts";
import { INDIA_BOUNDS } from "./india";
import {
  ROAD_CONDITION_COLORS,
  SPEED_BREAKER_COLOR,
  type RoadSegment,
  type SpeedBreaker,
} from "./roadConditions";

export const GOOGLE_KATPADI_URL =
  "https://www.google.com/maps/search/?api=1&query=Katpadi%2C+Vellore";
export const GOOGLE_INDIA_URL =
  "https://www.google.com/maps/search/?api=1&query=India";
/** Hands the route to the Google Maps app/site for live turn-by-turn. A null
 * origin lets Google Maps use the device's current location. */
export function googleDirectionsUrl(origin: Point | null, destination: Point) {
  const q = new URLSearchParams({
    api: "1",
    destination: `${destination.lat},${destination.lon}`,
    travelmode: "two-wheeler",
    dir_action: "navigate",
  });
  if (origin) q.set("origin", `${origin.lat},${origin.lon}`);
  return `https://www.google.com/maps/dir/?${q}`;
}
export type GoogleMapData = {
  position: Point | null;
  origin?: Point | null;
  destination?: Point | null;
  route: Point[];
  potholes: Pothole[];
  speedBreakers?: SpeedBreaker[];
  roads?: RoadSegment[];
};
export type GoogleMapCallbacks = {
  onDestination?: (point: Point) => void;
  onHazard?: (pothole: Pothole) => void;
  onBounds?: (bounds: {
    south: number;
    north: number;
    west: number;
    east: number;
  }) => void;
};
/** Pothole dot colors by status; shared by the website legend. */
export const HAZARD_COLORS: Record<Pothole["status"], string> = {
  suspected: "#F59E0B",
  corroborated: "#DC2626",
  disputed: "#9CA3AF",
  repaired: "#16A34A",
};
const dot = (fill: string, size: number, ring = "#FFFFFF", border = 2) =>
  `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${fill};border:${border}px solid ${ring};box-shadow:0 1px 3px #0005"></span>`;
/** Striped bar, like a painted speed breaker; shared by the website legend. */
export const speedBreakerIcon = (width = 18) =>
  `<span style="display:block;width:${width}px;height:${Math.round(width * 0.55)}px;border-radius:3px;border:1.5px solid #1F1F1F;background:repeating-linear-gradient(135deg,${SPEED_BREAKER_COLOR} 0 4px,#1F1F1F 4px 7px);box-shadow:0 1px 3px #0005"></span>`;
const escapeHtml = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const authErrors = new Set<() => void>();
export function onGoogleMapAuthError(callback: () => void) {
  authErrors.add(callback);
  (window as Window & { gm_authFailure?: () => void }).gm_authFailure = () =>
    authErrors.forEach((fn) => fn());
  return () => {
    authErrors.delete(callback);
  };
}

/** One browser renderer shared by the website and React Native web preview.
 * `home` is the overview area: all of India live, Katpadi for the demo. */
export function createGoogleMap(
  host: HTMLElement,
  callbacks: GoogleMapCallbacks,
  interactive = true,
  mapId = "DEMO_MAP_ID",
  home: {
    south: number;
    west: number;
    north: number;
    east: number;
  } = INDIA_BOUNDS,
) {
  const map = new google.maps.Map(host, {
    center: {
      lat: (home.south + home.north) / 2,
      lng: (home.west + home.east) / 2,
    },
    zoom: 5,
    mapId,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    clickableIcons: false,
    gestureHandling: interactive ? "cooperative" : "none",
    zoomControl: interactive,
    keyboardShortcuts: interactive,
  });
  const overview = () => map.fitBounds(home, 24);
  overview();
  const route = new google.maps.Polyline({
    map,
    strokeColor: "#2563EB",
    strokeWeight: 6,
    strokeOpacity: 1,
    clickable: false,
    zIndex: 2,
  });
  const roadLines = new Map<string, google.maps.Polyline>();
  const roadInfo = new google.maps.InfoWindow();
  let previousRoads: RoadSegment[] | undefined;
  const markers = new Map<
    string,
    { marker: google.maps.marker.AdvancedMarkerElement; node: HTMLElement }
  >();
  let previousRoute: Point[] | undefined;
  let located = false;
  const listeners = [
    map.addListener("click", (event: google.maps.MapMouseEvent) => {
      if (interactive && event.latLng)
        callbacks.onDestination?.({
          lat: event.latLng.lat(),
          lon: event.latLng.lng(),
        });
    }),
    map.addListener("idle", () => {
      const b = map.getBounds();
      if (b) callbacks.onBounds?.(b.toJSON());
    }),
  ];
  function update(data: GoogleMapData) {
    const visible = new Set<string>();
    const addMarker = (
      id: string,
      point: Point,
      title: string,
      html: string,
      action?: () => void,
    ) => {
      visible.add(id);
      const existing = markers.get(id);
      const node =
        existing?.node || document.createElement(action ? "button" : "div");
      if (node instanceof HTMLButtonElement) node.type = "button";
      if (node.innerHTML !== html) node.innerHTML = html;
      node.setAttribute("aria-label", title);
      node.title = title;
      // Markers anchor bottom-centre: the pin tip sits on the point, dots are
      // shifted down to centre on it. Padding keeps a finger-sized hit area.
      const pin = id === "destination";
      node.style.cssText = `padding:${pin ? 0 : 6}px;border:0;background:none;display:grid;place-items:center;transform:translateY(${pin ? 0 : 50}%);cursor:${action ? "pointer" : "default"}`;
      if (action)
        node.onclick = (event) => {
          event.stopPropagation();
          action();
        };
      if (existing) {
        existing.marker.position = { lat: point.lat, lng: point.lon };
        existing.marker.title = title;
        return;
      }
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat: point.lat, lng: point.lon },
        title,
        zIndex:
          id === "rider"
            ? 300
            : id.startsWith("hazard-")
              ? 100
              : id.startsWith("bump-")
                ? 90
                : 200,
        content: node,
      });
      markers.set(id, { marker, node });
    };
    for (const p of data.potholes)
      addMarker(
        `hazard-${p.id}`,
        p,
        `${p.status} pothole · ${p.sightings} sighting${p.sightings === 1 ? "" : "s"}`,
        dot(HAZARD_COLORS[p.status] || HAZARD_COLORS.suspected, 11),
        () => callbacks.onHazard?.(p),
      );
    for (const s of data.speedBreakers || [])
      addMarker(`bump-${s.id}`, s, s.kind, speedBreakerIcon());
    if (data.origin)
      addMarker(
        "origin",
        data.origin,
        "Start",
        dot("#FFFFFF", 14, "#20201E", 4),
      );
    if (data.position)
      addMarker(
        "rider",
        data.position,
        "Your location",
        `<span style="width:18px;height:18px;border-radius:50%;background:#1A73E8;border:3px solid #fff;box-shadow:0 0 0 7px #1A73E833,0 1px 4px #0006"></span>`,
      );
    if (data.destination)
      addMarker(
        "destination",
        data.destination,
        "Destination",
        `<svg width="28" height="38" viewBox="0 0 28 38"><path d="M14 37C14 37 27 22 27 13.5A13 13 0 0 0 1 13.5C1 22 14 37 14 37Z" fill="#EA4335" stroke="#B31412" stroke-width="1.5"/><circle cx="14" cy="13.5" r="5" fill="#B31412"/></svg>`,
      );
    markers.forEach((entry, id) => {
      if (!visible.has(id)) {
        entry.marker.map = null;
        markers.delete(id);
      }
    });
    if (data.roads !== previousRoads) {
      const roads = data.roads || [];
      const keep = new Set(roads.map((r) => r.id));
      roadLines.forEach((line, id) => {
        if (keep.has(id)) return;
        google.maps.event.clearInstanceListeners(line);
        line.setMap(null);
        roadLines.delete(id);
      });
      for (const road of roads) {
        const options = {
          path: road.path.map((p) => ({ lat: p.lat, lng: p.lon })),
          strokeColor: ROAD_CONDITION_COLORS[road.condition],
          strokeOpacity: 0.8,
          strokeWeight: road.condition === "poor" ? 6 : 5,
          zIndex: 1,
        };
        const existing = roadLines.get(road.id);
        if (existing) existing.setOptions(options);
        else {
          const line = new google.maps.Polyline({ map, ...options });
          roadLines.set(road.id, line);
        }
        const line = roadLines.get(road.id)!;
        google.maps.event.clearListeners(line, "click");
        line.addListener("click", (event: google.maps.PolyMouseEvent) => {
          roadInfo.setContent(
            `<div style="font:13px/1.4 system-ui,sans-serif;max-width:220px"><strong>${escapeHtml(road.name)}</strong><br>${road.condition === "poor" ? "Bad road" : "Rough road"} · ${escapeHtml(road.reasons.join(", "))}</div>`,
          );
          roadInfo.setPosition(event.latLng);
          roadInfo.open({ map });
        });
      }
      previousRoads = data.roads;
    }
    route.setPath(data.route.map((p) => ({ lat: p.lat, lng: p.lon })));
    if (data.route !== previousRoute && data.route.length > 1) {
      const b = new google.maps.LatLngBounds();
      data.route.forEach((p) => b.extend({ lat: p.lat, lng: p.lon }));
      map.fitBounds(b, 40);
    }
    previousRoute = data.route;
    // Zoom from the overview to the rider the first time a fix arrives.
    if (data.position && !located && data.route.length < 2)
      focus(data.position);
    located ||= !!data.position;
  }
  function focus(point: Point) {
    map.panTo({ lat: point.lat, lng: point.lon });
    map.setZoom(Math.max(map.getZoom() || 0, 16));
  }
  return {
    update,
    overview,
    focus,
    destroy() {
      listeners.forEach((listener) => listener.remove());
      markers.forEach(({ marker }) => {
        google.maps.event.clearInstanceListeners(marker);
        marker.map = null;
      });
      markers.clear();
      roadLines.forEach((line) => {
        google.maps.event.clearInstanceListeners(line);
        line.setMap(null);
      });
      roadLines.clear();
      roadInfo.close();
      route.setMap(null);
      google.maps.event.clearInstanceListeners(map);
      host.replaceChildren();
    },
  };
}
