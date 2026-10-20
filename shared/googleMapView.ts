import type { Point, Pothole } from "./contracts";
import { KATPADI_BOUNDS, KATPADI_CENTER } from "./katpadi";

export const GOOGLE_KATPADI_URL =
  "https://www.google.com/maps/search/?api=1&query=Katpadi%2C+Vellore";
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
const authErrors = new Set<() => void>();
export function onGoogleMapAuthError(callback: () => void) {
  authErrors.add(callback);
  (window as Window & { gm_authFailure?: () => void }).gm_authFailure = () =>
    authErrors.forEach((fn) => fn());
  return () => {
    authErrors.delete(callback);
  };
}

/** One browser renderer shared by the website and React Native web preview. */
export function createGoogleMap(
  host: HTMLElement,
  callbacks: GoogleMapCallbacks,
  interactive = true,
  mapId = "DEMO_MAP_ID",
) {
  const map = new google.maps.Map(host, {
    center: { lat: KATPADI_CENTER.lat, lng: KATPADI_CENTER.lon },
    zoom: 13,
    mapId,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    clickableIcons: false,
    gestureHandling: interactive ? "cooperative" : "none",
    zoomControl: interactive,
    keyboardShortcuts: interactive,
  });
  const overview = () => map.fitBounds(KATPADI_BOUNDS, 24);
  overview();
  const route = new google.maps.Polyline({
    map,
    strokeColor: "#2563EB",
    strokeWeight: 6,
    strokeOpacity: 1,
    clickable: false,
  });
  const markers = new Map<
    string,
    { marker: google.maps.marker.AdvancedMarkerElement; node: HTMLElement }
  >();
  let previousRoute: Point[] | undefined;
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
        zIndex: id === "rider" ? 300 : id.startsWith("hazard-") ? 100 : 200,
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
    route.setPath(data.route.map((p) => ({ lat: p.lat, lng: p.lon })));
    if (data.route !== previousRoute && data.route.length > 1) {
      const b = new google.maps.LatLngBounds();
      data.route.forEach((p) => b.extend({ lat: p.lat, lng: p.lon }));
      map.fitBounds(b, 40);
    }
    previousRoute = data.route;
  }
  return {
    update,
    overview,
    focus(point: Point) {
      map.panTo({ lat: point.lat, lng: point.lon });
      map.setZoom(Math.max(map.getZoom() || 0, 16));
    },
    destroy() {
      listeners.forEach((listener) => listener.remove());
      markers.forEach(({ marker }) => {
        google.maps.event.clearInstanceListeners(marker);
        marker.map = null;
      });
      markers.clear();
      route.setMap(null);
      google.maps.event.clearInstanceListeners(map);
      host.replaceChildren();
    },
  };
}
