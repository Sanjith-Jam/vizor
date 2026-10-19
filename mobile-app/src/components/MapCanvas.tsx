import React, { useEffect, useRef, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { AppText, Button } from "./ui";
import { colors, radius } from "../theme";
import type { Point, Pothole } from "../../../shared/contracts";
import { KATPADI_CENTER } from "../../../shared/katpadi";
export interface MapCanvasProps {
  riderPosition: Point | null;
  destination: Point | null;
  routeCoordinates?: Point[];
  bearing?: number | null;
  interactive?: boolean;
  style?: object;
  potholes?: Pothole[];
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
export function MapCanvas({
  riderPosition,
  destination,
  routeCoordinates = [],
  interactive = true,
  style,
  potholes = [],
  onDestination,
  onHazard,
  onBounds,
}: MapCanvasProps) {
  const ref = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [attempt, setAttempt] = useState(0);
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
  return (
    <View style={[styles.container, style]}>
      {key ? (
        <MapView
          ref={ref}
          key={attempt}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFill}
          initialRegion={{
            ...coord(KATPADI_CENTER),
            latitudeDelta: 0.08,
            longitudeDelta: 0.08,
          }}
          showsCompass={false}
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
          onRegionChangeComplete={(region) =>
            onBounds?.({
              south: region.latitude - region.latitudeDelta / 2,
              north: region.latitude + region.latitudeDelta / 2,
              west: region.longitude - region.longitudeDelta / 2,
              east: region.longitude + region.longitudeDelta / 2,
            })
          }
        >
          {routeCoordinates.length > 1 && (
            <Polyline
              coordinates={routeCoordinates.map(coord)}
              strokeColor="#2563EB"
              strokeWidth={6}
            />
          )}
          {potholes.map((p) => (
            <Marker
              key={p.id}
              zIndex={100}
              coordinate={coord(p)}
              title={`${p.status} road report`}
              pinColor={p.status === "repaired" ? "green" : "orange"}
              onPress={(event) => {
                event.stopPropagation();
                onHazard?.(p);
              }}
            />
          ))}
          {riderPosition && (
            <Marker
              coordinate={coord(riderPosition)}
              title="Rider position"
              pinColor="blue"
            />
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
      {(!key || timedOut) && (
        <View style={styles.notice}>
          <AppText weight="bold">Google Maps · Katpadi</AppText>
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
              if (!key)
                void Linking.openURL(
                  "https://www.google.com/maps/search/?api=1&query=Katpadi%2C+Vellore",
                );
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
});
