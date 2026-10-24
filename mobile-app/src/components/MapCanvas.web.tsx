/// <reference types="google.maps" />
import React, { useEffect, useRef, useState } from "react";
import { Linking, View } from "react-native";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { Ionicons } from "@expo/vector-icons";
import {
  createGoogleMap,
  GOOGLE_INDIA_URL,
  onGoogleMapAuthError,
} from "../../../shared/googleMapView";
import {
  createRoadConditionsFeed,
  EMPTY_ROAD_CONDITIONS,
  type Bounds,
} from "../../../shared/roadConditions";
import { mergeRoadConditions } from "../../../shared/roadAlerts";
import type { MapCanvasProps } from "./MapCanvas";
import { AppText, Button } from "./ui";
import { colors, radius } from "../theme";

const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY || "";
if (key) setOptions({ key, v: "weekly", region: "IN", language: "en" });

export function MapCanvas(props: MapCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<ReturnType<typeof createGoogleMap> | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<Bounds | null>(null);
  const [viewRoad, setRoad] = useState(EMPTY_ROAD_CONDITIONS);
  const road = React.useMemo(
    () =>
      props.extraRoad
        ? mergeRoadConditions(viewRoad, props.extraRoad)
        : viewRoad,
    [viewRoad, props.extraRoad],
  );
  const feed = useRef<ReturnType<typeof createRoadConditionsFeed> | null>(null);
  useEffect(() => {
    feed.current = createRoadConditionsFeed(setRoad);
    return () => feed.current?.dispose();
  }, []);
  useEffect(() => {
    feed.current?.request(view, props.potholes || []);
  }, [view, props.potholes]);
  const mapData = () => ({
    position: latest.current.riderPosition,
    destination: latest.current.destination,
    origin: latest.current.origin,
    route: latest.current.routeCoordinates || [],
    potholes: latest.current.potholes || [],
    speedBreakers: road.speedBreakers,
    roads: road.roads,
  });
  useEffect(() => {
    if (!key || !host.current) return;
    let cancelled = false;
    setReady(false);
    setError("");
    const removeAuth = onGoogleMapAuthError(() => {
      if (!cancelled)
        setError(
          "Google Maps authorization failed. Check the key and allowed website URLs.",
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
            onDestination: (p) => latest.current.onDestination?.(p),
            onHazard: (p) => latest.current.onHazard?.(p),
            onBounds: (b) => {
              setView(b);
              latest.current.onBounds?.(b);
            },
          },
          latest.current.interactive !== false,
          process.env.EXPO_PUBLIC_GOOGLE_MAP_ID || "DEMO_MAP_ID",
        );
        renderer.current.update(mapData());
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          clearTimeout(timer);
          setError(
            "Google Maps could not load. Check your internet connection and map key.",
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
    renderer.current?.update(mapData());
  }, [
    props.riderPosition,
    props.destination,
    props.origin,
    props.routeCoordinates,
    props.potholes,
    road,
    ready,
  ]);
  return (
    <View
      style={[
        {
          overflow: "hidden",
          borderRadius: radius.lg,
          minHeight: 240,
          position: "relative",
          backgroundColor: colors.surfaceRaised,
        },
        props.style,
      ]}
    >
      <div
        ref={host}
        role="region"
        aria-label="Google Maps of India"
        style={{ position: "absolute", inset: 0 }}
      />
      {(!ready || error) && (
        <View
          style={{ flex: 1, padding: 22, gap: 10, justifyContent: "center" }}
          accessibilityRole={error ? "alert" : undefined}
        >
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <Ionicons name="map-outline" size={23} color={colors.text} />
            <AppText weight="bold">Google Maps · India</AppText>
          </View>
          <AppText variant="small" color={colors.textMuted}>
            {!key
              ? "Interactive maps will appear when the Google Maps web key is connected."
              : error || "Loading Google Maps…"}
          </AppText>
          {!key && (
            <Button
              label="Open Google Maps"
              compact
              variant="secondary"
              onPress={() => void Linking.openURL(GOOGLE_INDIA_URL)}
            />
          )}
          {!!error && (
            <Button
              label="Retry map"
              compact
              onPress={() => setAttempt((v) => v + 1)}
            />
          )}
        </View>
      )}
    </View>
  );
}
