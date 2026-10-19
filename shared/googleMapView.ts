import type { Point, Pothole } from "./contracts";
import { KATPADI_BOUNDS, KATPADI_CENTER } from "./katpadi";

export const GOOGLE_KATPADI_URL =
  "https://www.google.com/maps/search/?api=1&query=Katpadi%2C+Vellore";
export type GoogleMapData = {
  position: Point | null;
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
      label: string,
      color: string,
      action?: () => void,
    ) => {
      visible.add(id);
      const existing = markers.get(id);
      const node =
        existing?.node || document.createElement(action ? "button" : "div");
      if (node instanceof HTMLButtonElement) node.type = "button";
      node.textContent = label;
      node.setAttribute("aria-label", title);
      node.style.cssText = `width:32px;height:32px;border:3px solid white;border-radius:50%;background:${color};color:white;display:grid;place-items:center;font:bold 15px sans-serif;box-shadow:0 2px 8px #0003;cursor:${action ? "pointer" : "default"}`;
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
        zIndex: id.startsWith("hazard-") ? 100 : 1,
        content: node,
      });
      markers.set(id, { marker, node });
    };
    for (const p of data.potholes)
      addMarker(
        `hazard-${p.id}`,
        p,
        `${p.status} road report ${p.id}`,
        p.status === "repaired" ? "✓" : "!",
        p.status === "repaired" ? "#286444" : "#9C5518",
        () => callbacks.onHazard?.(p),
      );
    if (data.position)
      addMarker("rider", data.position, "Rider position", "↑", "#2563EB");
    if (data.destination)
      addMarker("destination", data.destination, "Destination", "•", "#20201E");
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
