/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";
import { LocateFixed } from "lucide-react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import {
  createGoogleMap,
  GOOGLE_KATPADI_URL,
  onGoogleMapAuthError,
} from "../../../shared/googleMapView";
import type { Point, Pothole } from "../../../shared/contracts";
import type { RoadSegment, SpeedBreaker } from "../../../shared/roadConditions";

const key = import.meta.env.VITE_GOOGLE_MAPS_KEY || "";
if (key) setOptions({ key, v: "weekly", region: "IN", language: "en" });

export function RoadMap(props: {
  demo: boolean;
  potholes: Pothole[];
  speedBreakers?: SpeedBreaker[];
  roads?: RoadSegment[];
  route: Point[];
  position: Point | null;
  destination?: Point | null;
  origin?: Point | null;
  onLocate?: () => Promise<Point>;
  onSelect: (p: Pothole) => void;
  onDestination: (p: Point) => void;
  onBounds: (bounds: {
    south: number;
    north: number;
    west: number;
    east: number;
  }) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<ReturnType<typeof createGoogleMap> | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!key || !host.current) return;
    let cancelled = false;
    setReady(false);
    setError("");
    const removeAuth = onGoogleMapAuthError(() => {
      if (!cancelled)
        setError(
          "Google Maps authorization failed. Check the key, billing and allowed website URLs.",
        );
    });
    const timer = setTimeout(() => {
      if (!cancelled)
        setError(
          "Google Maps took too long to load. Check your connection and retry.",
        );
    }, 15000);
    Promise.all([importLibrary("maps"), importLibrary("marker")])
      .then(() => {
        if (cancelled || !host.current) return;
        clearTimeout(timer);
        renderer.current = createGoogleMap(
          host.current,
          {
            onDestination: (p) => latest.current.onDestination(p),
            onHazard: (p) => latest.current.onSelect(p),
            onBounds: (b) => latest.current.onBounds(b),
          },
          true,
          import.meta.env.VITE_GOOGLE_MAP_ID || "DEMO_MAP_ID",
        );
        renderer.current.update(latest.current);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          clearTimeout(timer);
          setError(
            "Google Maps could not load. Check your connection and key configuration.",
          );
        }
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      removeAuth();
      renderer.current?.destroy();
      renderer.current = null;
    };
  }, [key, attempt]);
  useEffect(() => {
    renderer.current?.update(props);
  }, [
    props.potholes,
    props.speedBreakers,
    props.roads,
    props.route,
    props.position,
    props.destination,
    props.origin,
    ready,
  ]);
  return (
    <>
      <div
        ref={host}
        className="road-map"
        aria-label="Google Maps of Katpadi. Use destination search or click a road."
      />
      {ready && !error && (
        <div className="map-overview">
          {props.onLocate && (
            <button
              aria-label="Show my location"
              title="My location"
              onClick={() =>
                void latest.current
                  .onLocate?.()
                  .then((p) => renderer.current?.focus(p))
                  .catch(() => {})
              }
            >
              <LocateFixed size={18} />
            </button>
          )}
          <button onClick={() => renderer.current?.overview()}>
            View all Katpadi
          </button>
        </div>
      )}
      {(!ready || error) && (
        <div
          className={`map-load-status ${!key ? "google-map-setup" : ""}`}
          role={error ? "alert" : "status"}
        >
          {!key ? (
            <>
              <strong>Google Maps</strong>
              <span>
                Connect the restricted web key to load the interactive Katpadi
                map.
              </span>
              <a href={GOOGLE_KATPADI_URL} target="_blank" rel="noreferrer">
                Open Katpadi in Google Maps ↗
              </a>
            </>
          ) : (
            error || "Loading Google Maps…"
          )}
          {error && (
            <button onClick={() => setAttempt((v) => v + 1)}>Retry map</button>
          )}
        </div>
      )}
    </>
  );
}
