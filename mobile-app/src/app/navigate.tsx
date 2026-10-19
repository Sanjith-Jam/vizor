import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  AppText,
  Banner,
  Button,
  EmptyState,
  ListRow,
  Screen,
  SectionTitle,
} from "../components/ui";
import { useRide } from "../hooks/useRide";
import { useSettings } from "../hooks/useSettings";
import { fetchRoutes, searchPlaces, type Place } from "../nav/osrmClient";
import { formatDistance, haversineMeters, type LatLon } from "../nav/geo";
import { useCloud } from "../cloud/useCloud";
import { routeHazards } from "../../../shared/contracts";
import type { Route } from "../nav/route";
import { DEMO_START, DEMO_ROUTE, DEMO_POTHOLES } from "../../../shared/demo";
import { KATPADI_PLACES } from "../../../shared/katpadi";
import { MapCanvas } from "../components/MapCanvas";
import { colors, fonts, radius, spacing, TOUCH_TARGET } from "../theme";

export default function NavigateScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ query?: string }>();
  const ride = useRide();
  const { hazards, loadHazards } = useCloud();
  const [destination, setDestination] = useState<Place | null>(null),
    [routes, setRoutes] = useState<Route[]>([]),
    [selected, setSelected] = useState(0),
    [sample, setSample] = useState(false);
  const { settings } = useSettings();
  const [query, setQuery] = useState(params.query || "");
  const [results, setResults] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [here, setHere] = useState<LatLon | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  const search = async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setSearching(true);
    setSearchError(null);
    try {
      setResults(await searchPlaces(q, here));
    } catch (e) {
      setSearchError((e as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const go = async (place: Place) => {
    if (startingId) return;
    setStartingId(place.id);
    setSearchError(null);
    setRoutes([]);
    try {
      const origin = sample
        ? DEMO_START
        : here || (await ride.getCurrentPosition());
      if (!origin) throw new Error("Location is needed to preview a route.");
      if (!sample) setHere(origin);
      setDestination(place);
      setRoutes(
        sample && place.id === KATPADI_PLACES[1].id
          ? [DEMO_ROUTE]
          : await fetchRoutes(origin, place.location),
      );
      setSelected(0);
      await loadHazards(origin);
    } catch (e) {
      setSearchError((e as Error).message);
    }
    setStartingId(null);
  };

  useEffect(() => {
    if (ride.phase === "active") {
      router.replace("/ride");
    }
  }, [ride.phase, router]);

  return (
    <Screen>
      <AppText variant="title" weight="bold">
        find your way.
      </AppText>
      <AppText color={colors.textMuted}>
        A destination. A little head start.
      </AppText>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={22} color={colors.textMuted} />
        <TextInput
          style={styles.input}
          placeholder="Search Google Maps"
          placeholderTextColor={colors.textFaint}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void search()}
          returnKeyType="search"
          accessibilityLabel="Destination search"
        />
        {searching ? <ActivityIndicator color={colors.accent} /> : null}
        {query ? (
          <Button
            label="Clear"
            compact
            variant="ghost"
            onPress={() => {
              setQuery("");
              setResults(null);
            }}
          />
        ) : null}
      </View>
      <Button
        label="Search"
        icon="search"
        onPress={() => void search()}
        disabled={query.trim().length < 2}
        loading={searching}
      />

      <AppText variant="small" color={colors.textMuted}>
        {Platform.OS === "web"
          ? "Search places · or click a road on the map."
          : "Search places · or long-press a road on the map."}
      </AppText>
      <MapCanvas
        riderPosition={sample ? DEMO_START : here}
        destination={destination?.location || null}
        potholes={sample ? DEMO_POTHOLES : hazards}
        routeCoordinates={routes[selected]?.geometry || []}
        style={{ height: 260 }}
        onDestination={(p) =>
          void go({
            id: "pin",
            name: "Selected destination",
            address: "Map pin",
            location: p,
          })
        }
      />
      <Button
        label="Preview Katpadi sample ride"
        variant="secondary"
        disabled={!!startingId}
        onPress={() => {
          setSample(true);
          setDestination(KATPADI_PLACES[1]);
          setRoutes([DEMO_ROUTE]);
          setSelected(0);
          setSearchError(null);
        }}
      />
      <Button
        label="Use my location for a real ride"
        variant="ghost"
        disabled={!!startingId}
        onPress={() => {
          setSample(false);
          setRoutes([]);
          setDestination(null);
          void ride.getCurrentPosition().then(setHere);
        }}
      />
      {sample && (
        <Banner
          tone="info"
          title="Scripted Katpadi preview"
          message="Sample position and potholes. This is a route preview, not a live ride or a road-condition survey."
        />
      )}
      {ride.locationBlocked ? (
        <Banner
          tone="danger"
          title="Location blocked"
          message="Allow location access for this app in system settings to navigate."
          action={
            <Button
              label="Open settings"
              compact
              onPress={ride.openLocationSettings}
            />
          }
        />
      ) : null}
      {ride.error ? (
        <Banner tone="danger" title="Couldn't start" message={ride.error} />
      ) : null}
      {searchError ? (
        <Banner tone="danger" title="Search failed" message={searchError} />
      ) : null}

      {results === null ? null : results.length === 0 ? (
        <EmptyState
          icon="sad-outline"
          title="No places found"
          message="Try VIT or Katpadi. You can also long-press a road on the map."
        />
      ) : (
        <>
          <SectionTitle>Results</SectionTitle>
          {results.map((p) => (
            <ListRow
              key={p.id}
              icon="location"
              title={p.name}
              subtitle={
                (here
                  ? `${formatDistance(haversineMeters(here, p.location), settings.units)} away · `
                  : "") + p.address
              }
              showChevron={false}
              onPress={startingId ? undefined : () => void go(p)}
              right={
                startingId === p.id ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <Ionicons name="navigate" size={22} color={colors.accent} />
                )
              }
            />
          ))}
        </>
      )}

      <SectionTitle>Route preview</SectionTitle>
      {routes.map((r, i) => (
        <ListRow
          key={i}
          icon={i === selected ? "radio-button-on" : "radio-button-off"}
          title={`${Math.ceil(r.duration / 60)} min · ${formatDistance(r.distance, settings.units)}`}
          subtitle={`${routeHazards(r.geometry, sample ? DEMO_POTHOLES : hazards).length} reported hazards along this route`}
          onPress={() => setSelected(i)}
        />
      ))}
      {routes.length > 0 && !sample && (
        <Button
          label="Start navigation"
          loading={ride.phase === "starting"}
          onPress={() => void ride.startRide(destination, routes[selected])}
        />
      )}
      <AppText variant="small" color={colors.textMuted}>
        {Platform.OS === "web"
          ? "Click a road on the map to select your destination."
          : "Long-press the map to select your destination."}
      </AppText>
      <AppText variant="caption" color={colors.textFaint} align="center">
        Google Maps. Live destinations and motorcycle routes use Google Places /
        Routes through your signed-in account. Sample route data is labeled
        separately.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: TOUCH_TARGET,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 16,
    paddingVertical: spacing.md,
  },
});
