import React, { useEffect, useRef, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { AppText, Button } from "./ui";
import { colors, radius } from "../theme";
import type { Point, Pothole } from "../../../shared/contracts";
import { INDIA_CENTER } from "../../../shared/india";
import { GOOGLE_INDIA_URL, HAZARD_COLORS } from "../../../shared/googleMapView";
import {
  EMPTY_ROAD_CONDITIONS,
  fetchAreaConditions,
  OSM_ATTRIBUTION,
  ROAD_CONDITION_COLORS,
  roadConditionsAvailable,
  SPEED_BREAKER_COLOR,
  FUEL_STATION_COLOR,
  type Bounds,
  type RoadConditions,
} from "../../../shared/roadConditions";
import { mergeRoadConditions } from "../../../shared/roadAlerts";
export interface MapCanvasProps {
  riderPosition: Point | null;
  destination: Point | null;
  origin?: Point | null;
  routeCoordinates?: Point[];
  bearing?: number | null;
  interactive?: boolean;
  style?: object;
  potholes?: Pothole[];
  /** Road data beyond the view (whole route, rider-marked speed breakers). */
  extraRoad?: RoadConditions;
  onDestination?: (point: Point) => void;
  onHazard?: (pothole: Pothole) => void;
  onBounds?: (bounds: {
    south: number;
    north: number;
    west: number;
    east: number;
  }) => void;
}
const coord = (p: Point) => ({ latitude: p.lat, longitude: p.lon });
const regionBounds = (r: {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}): Bounds => ({
  south: r.latitude - r.latitudeDelta / 2,
  north: r.latitude + r.latitudeDelta / 2,
  west: r.longitude - r.longitudeDelta / 2,
  east: r.longitude + r.longitudeDelta / 2,
});
// Mapped speed breakers are sparse, so load at least ~11 km around the view:
// a street-level zoom (~1 km across) would otherwise rarely contain any.
const MIN_ROAD_AREA_DEG = 0.1;
const roadArea = (b: Bounds): Bounds => {
  const lat = (b.south + b.north) / 2,
    lon = (b.west + b.east) / 2,
    h = Math.max(b.north - b.south, MIN_ROAD_AREA_DEG) / 2,
    w = Math.max(b.east - b.west, MIN_ROAD_AREA_DEG) / 2;
  return { south: lat - h, north: lat + h, west: lon - w, east: lon + w };
};
type RoadStatus = "zoom" | "loading" | "ready" | "failed";
// All of India until the rider's location or a route moves the camera.
const INITIAL_REGION = {
  ...coord(INDIA_CENTER),
  latitudeDelta: 30,
  longitudeDelta: 30,
};
export function MapCanvas({
  riderPosition,
  destination,
  origin = null,
  routeCoordinates = [],
  interactive = true,
  style,
  potholes = [],
  extraRoad,
  onDestination,
  onHazard,
  onBounds,
}: MapCanvasProps) {
  const ref = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<Bounds>(() => regionBounds(INITIAL_REGION));
  const [viewRoad, setRoad] = useState(EMPTY_ROAD_CONDITIONS);
  const road = React.useMemo(
    () => (extraRoad ? mergeRoadConditions(viewRoad, extraRoad) : viewRoad),
    [viewRoad, extraRoad],
  );
  const [roadStatus, setRoadStatus] = useState<RoadStatus>("zoom");
  useEffect(() => {
    if (!ready) return;
    if (!roadConditionsAvailable(view)) {
      setRoadStatus("zoom");
      return;
    }
    // Keep showing loaded data while a pan refreshes it.
    setRoadStatus((s) => (s === "ready" ? s : "loading"));
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchAreaConditions(roadArea(view), potholes, controller.signal)
        .then((data) => {
          setRoad(data);
          setRoadStatus("ready");
        })
        .catch(() => {
          if (!controller.signal.aborted) setRoadStatus("failed");
        });
    }, 700);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [ready, view, potholes]);
  const bunks = road.fuelStations || [];
  const roadCount =
    road.speedBreakers.length + road.roads.length + bunks.length > 0
      ? [
          road.speedBreakers.length &&
            `${road.speedBreakers.length} speed breaker${road.speedBreakers.length === 1 ? "" : "s"}`,
          road.roads.length &&
            `${road.roads.length} rough/bad road${road.roads.length === 1 ? "" : "s"}`,
          bunks.length &&
            `${bunks.length} petrol bunk${bunks.length === 1 ? "" : "s"}`,
        ]
          .filter(Boolean)
          .join(" · ")
      : null;
  const roadMessage =
    roadCount ??
    {
      zoom: "Zoom in to a city to see speed breakers and bad roads",
      loading:
        "Loading speed breakers and road surface… (up to 40 s the first time)",
      failed: "Couldn't load road data. Move the map to retry.",
      ready: "No speed breakers or bad roads mapped near here yet",
    }[roadStatus];
  // Android draws custom marker views only while tracking; stop after a
  // moment so hundreds of dots don't re-render every frame.
  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    setTracks(true);
    const t = setTimeout(() => setTracks(false), 1000);
    return () => clearTimeout(t);
  }, [potholes, road, origin, riderPosition, ready]);
  const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY || "";
  useEffect(() => {
    if (!key || ready) return;
    const timer = setTimeout(() => setTimedOut(true), 15000);
    return () => clearTimeout(timer);
  }, [key, ready, attempt]);
  useEffect(() => {
    if (ready && routeCoordinates.length > 1)
      ref.current?.fitToCoordinates(routeCoordinates.map(coord), {
        edgePadding: { top: 40, bottom: 40, left: 30, right: 30 },
        animated: false,
      });
  }, [ready, routeCoordinates]);
  useEffect(() => {
    if (ready && riderPosition && routeCoordinates.length < 2)
      ref.current?.animateCamera({ center: coord(riderPosition), zoom: 15 });
  }, [ready, riderPosition?.lat, riderPosition?.lon]);
  return (
    <View style={[styles.container, style]}>
      {key ? (
        <MapView
          ref={ref}
          key={attempt}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFill}
          initialRegion={INITIAL_REGION}
          showsCompass={false}
          showsUserLocation={interactive}
          showsMyLocationButton={interactive}
          toolbarEnabled={false}
          loadingEnabled
          scrollEnabled={interactive}
          zoomEnabled={interactive}
          rotateEnabled={interactive}
          pitchEnabled={false}
          onMapReady={() => {
            setReady(true);
            setTimedOut(false);
          }}
          onLongPress={(event) => {
            if (interactive)
              onDestination?.({
                lat: event.nativeEvent.coordinate.latitude,
                lon: event.nativeEvent.coordinate.longitude,
              });
          }}
          onRegionChangeComplete={(region) => {
            const bounds = regionBounds(region);
            setView(bounds);
            onBounds?.(bounds);
          }}
        >
          {road.roads.map((r) => (
            <Polyline
              key={r.id}
              coordinates={r.path.map(coord)}
              strokeColor={ROAD_CONDITION_COLORS[r.condition]}
              strokeWidth={r.condition === "poor" ? 6 : 5}
              zIndex={1}
            />
          ))}
          {routeCoordinates.length > 1 && (
            <Polyline
              coordinates={routeCoordinates.map(coord)}
              strokeColor="#2563EB"
              strokeWidth={6}
              zIndex={2}
            />
          )}
          {potholes.map((p) => (
            <Marker
              key={p.id}
              zIndex={100}
              coordinate={coord(p)}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={tracks}
              title={`${p.status} pothole`}
              description={`${p.sightings} sighting${p.sightings === 1 ? "" : "s"}`}
              onPress={(event) => {
                event.stopPropagation();
                onHazard?.(p);
              }}
            >
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      HAZARD_COLORS[p.status] || HAZARD_COLORS.suspected,
                  },
                ]}
              />
            </Marker>
          ))}
          {bunks.map((f) => (
            <Marker
              key={f.id}
              zIndex={80}
              coordinate={coord(f)}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={tracks}
              title={f.name}
              description="Petrol bunk · OpenStreetMap"
            >
              <View style={styles.fuel}>
                <AppText style={styles.fuelText}>⛽</AppText>
              </View>
            </Marker>
          ))}
          {road.speedBreakers.map((s) => (
            <Marker
              key={s.id}
              zIndex={90}
              coordinate={coord(s)}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={tracks}
              title={s.kind}
              description="Mapped on OpenStreetMap"
            >
              <View style={styles.speedBreaker}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={styles.speedBreakerStripe} />
                ))}
              </View>
            </Marker>
          ))}
          {origin && (
            <Marker
              coordinate={coord(origin)}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={tracks}
              title="Start"
            >
              <View style={styles.origin} />
            </Marker>
          )}
          {riderPosition && (
            <Marker
              coordinate={coord(riderPosition)}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={tracks}
              zIndex={300}
              title="Your position"
            >
              <View style={styles.rider} />
            </Marker>
          )}
          {destination && (
            <Marker
              coordinate={coord(destination)}
              title="Destination"
              pinColor="red"
            />
          )}
        </MapView>
      ) : null}
      {!!key && ready && !timedOut && (
        <View style={styles.legend} pointerEvents="none">
          <AppText variant="small" weight="semibold">
            {roadMessage}
          </AppText>
          {(roadCount || roadStatus === "ready") && (
            <AppText variant="small" color={colors.textMuted}>
              {OSM_ATTRIBUTION}
            </AppText>
          )}
        </View>
      )}
      {(!key || timedOut) && (
        <View style={styles.notice}>
          <AppText weight="bold">Google Maps · India</AppText>
          <AppText variant="small" color={colors.textMuted}>
            {!key
              ? "Connect the Android Maps key and rebuild the app to enable the interactive map."
              : "Map loading timed out. Check connectivity and the Android key restrictions."}
          </AppText>
          <Button
            label={!key ? "Open Google Maps" : "Retry map"}
            compact
            variant="secondary"
            onPress={() => {
              if (!key) void Linking.openURL(GOOGLE_INDIA_URL);
              else {
                setTimedOut(false);
                setReady(false);
                setAttempt((v) => v + 1);
              }
            }}
          />
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceRaised,
    position: "relative",
    minHeight: 240,
  },
  notice: { flex: 1, padding: 22, gap: 10, justifyContent: "center" },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  origin: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 4,
    borderColor: "#20201E",
    backgroundColor: "#FFFFFF",
  },
  fuel: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    backgroundColor: FUEL_STATION_COLOR,
    alignItems: "center",
    justifyContent: "center",
  },
  fuelText: { fontSize: 11, lineHeight: 14 },
  speedBreaker: {
    width: 18,
    height: 10,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: "#1F1F1F",
    backgroundColor: SPEED_BREAKER_COLOR,
    flexDirection: "row",
    justifyContent: "space-evenly",
    overflow: "hidden",
  },
  speedBreakerStripe: {
    width: 2.5,
    backgroundColor: "#1F1F1F",
    transform: [{ skewX: "-30deg" }],
  },
  legend: {
    position: "absolute",
    left: 10,
    bottom: 10,
    maxWidth: "80%",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    opacity: 0.94,
  },
  rider: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    backgroundColor: "#1A73E8",
  },
});
