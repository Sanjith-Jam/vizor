import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  StyleSheet,
  View,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { AppText, Banner, Button, StatusBadge } from "../components/ui";
import { DIRECTION_ICON } from "../components/HudPreview";
import { STATUS_META } from "../components/statusMeta";
import { MapCanvas } from "../components/MapCanvas";
import { RoadScanner } from "../components/RoadScanner";
import { useCloud } from "../cloud/useCloud";
import { useRide } from "../hooks/useRide";
import { useSettings } from "../hooks/useSettings";
import { useHelmetConnection } from "../hooks/useHelmetConnection";
import { formatDistance, formatDuration, speedValue } from "../nav/geo";
import { colors, fonts, radius, spacing } from "../theme";

type RideViewMode = "dashboard" | "map" | "scanner";

/** Full-screen riding dashboard with Live Map Canvas & Road AI Scanner. */
export default function RideScreen() {
  const router = useRouter();
  const ride = useRide();
  const { hazards: sharedHazards } = useCloud();
  const { settings } = useSettings();
  const { status } = useHelmetConnection();
  const [now, setNow] = useState(Date.now());
  const [viewMode, setViewMode] = useState<RideViewMode>("dashboard");

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (ride.phase === "idle") {
      if (router.canGoBack()) router.back();
      else router.replace("/");
    }
  }, [ride.phase, router]);

  const confirmEnd = () => {
    Alert.alert("End ride?", "Your ride will be saved to history.", [
      { text: "Keep riding", style: "cancel" },
      { text: "End ride", style: "destructive", onPress: ride.endRide },
    ]);
    return true;
  };
  const confirmEndRef = useRef(confirmEnd);
  confirmEndRef.current = confirmEnd;

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () =>
      confirmEndRef.current(),
    );
    return () => sub.remove();
  }, []);

  const step =
    ride.route && ride.progress
      ? ride.route.steps[ride.progress.nextStepIndex]
      : null;
  const elapsed = ride.startedAt ? (now - ride.startedAt) / 1000 : 0;
  const speed = speedValue(ride.speedMps, settings.units);
  const speedUnit = settings.units === "imperial" ? "mph" : "km/h";
  const eta =
    ride.route && ride.progress && ride.route.distance > 0
      ? new Date(
          now +
            ((ride.route.duration * ride.progress.distanceRemaining) /
              ride.route.distance) *
              1000,
        )
      : null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header & View Mode Switcher */}
      <View style={styles.topBar}>
        <View style={styles.flex}>
          <AppText weight="bold" numberOfLines={1}>
            {ride.destination ? `To ${ride.destination.name}` : "Free ride"}
          </AppText>
        </View>
        <StatusBadge
          label={STATUS_META[status].label}
          color={STATUS_META[status].color}
        />
      </View>

      <View style={styles.modeTabs}>
        <TouchableOpacity
          style={[
            styles.modeTab,
            viewMode === "dashboard" && styles.modeTabActive,
          ]}
          onPress={() => setViewMode("dashboard")}
        >
          <MaterialCommunityIcons
            name="view-dashboard-outline"
            size={18}
            color={viewMode === "dashboard" ? colors.accent : colors.textMuted}
          />
          <AppText
            variant="caption"
            weight="bold"
            color={viewMode === "dashboard" ? colors.accent : colors.textMuted}
          >
            DASHBOARD
          </AppText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeTab, viewMode === "map" && styles.modeTabActive]}
          onPress={() => setViewMode("map")}
        >
          <Ionicons
            name="map-outline"
            size={18}
            color={viewMode === "map" ? colors.accent : colors.textMuted}
          />
          <AppText
            variant="caption"
            weight="bold"
            color={viewMode === "map" ? colors.accent : colors.textMuted}
          >
            LIVE MAP
          </AppText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.modeTab,
            viewMode === "scanner" && styles.modeTabActive,
          ]}
          onPress={() => setViewMode("scanner")}
        >
          <Ionicons
            name="camera-outline"
            size={18}
            color={viewMode === "scanner" ? colors.accent : colors.textMuted}
          />
          <AppText
            variant="caption"
            weight="bold"
            color={viewMode === "scanner" ? colors.accent : colors.textMuted}
          >
            ROAD AI
          </AppText>
        </TouchableOpacity>
      </View>

      {/* Reroute / Status Banners */}
      {ride.rerouting ? (
        <Banner tone="info" title="Recalculating route…" />
      ) : null}
      {ride.progress?.offRoute && !ride.rerouting ? (
        <Banner tone="warning" title="Off route" />
      ) : null}
      {status !== "connected" ? (
        <Banner
          tone="warning"
          title="Helmet not connected"
          message="Arrows show here only until the helmet reconnects."
        />
      ) : null}

      {/* Main Content Area based on View Mode */}
      {viewMode === "dashboard" ? (
        <>
          {ride.route && ride.progress ? (
            <View
              style={[
                styles.turnCard,
                ride.progress.arrived && styles.turnCardArrived,
              ]}
            >
              <MaterialCommunityIcons
                name={DIRECTION_ICON[ride.progress.direction]}
                size={84}
                color={colors.onAccent}
              />
              <View style={styles.flex}>
                {ride.progress.arrived ? (
                  <AppText
                    variant="title"
                    weight="extrabold"
                    color={colors.onAccent}
                  >
                    You've arrived
                  </AppText>
                ) : (
                  <>
                    <AppText
                      style={styles.turnDistance}
                      color={colors.onAccent}
                    >
                      {formatDistance(
                        ride.progress.distanceToManeuver,
                        settings.units,
                      )}
                    </AppText>
                    <AppText
                      variant="heading"
                      weight="bold"
                      color={colors.onAccent}
                      numberOfLines={2}
                    >
                      {step?.instruction ?? ""}
                    </AppText>
                  </>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.freeCard}>
              <MaterialCommunityIcons
                name="motorbike"
                size={48}
                color={colors.accent}
              />
              <AppText color={colors.textMuted} align="center">
                Tracking your speed and distance. Start navigation from the Ride
                tab for turn arrows.
              </AppText>
            </View>
          )}

          <View style={styles.speedo}>
            <AppText style={styles.speed}>{speed}</AppText>
            <AppText weight="semibold" color={colors.textMuted}>
              {speedUnit}
            </AppText>
          </View>
        </>
      ) : viewMode === "map" ? (
        <View style={styles.mapWrapper}>
          <MapCanvas
            potholes={sharedHazards}
            riderPosition={ride.position}
            destination={ride.destination?.location ?? null}
            routeCoordinates={ride.route?.geometry}
            style={styles.fullMap}
          />
          {ride.route && ride.progress ? (
            <View style={styles.floatingTurnBadge}>
              <MaterialCommunityIcons
                name={DIRECTION_ICON[ride.progress.direction]}
                size={32}
                color={colors.onAccent}
              />
              <View style={styles.flex}>
                <AppText weight="extrabold" color={colors.onAccent}>
                  {formatDistance(
                    ride.progress.distanceToManeuver,
                    settings.units,
                  )}
                </AppText>
                <AppText
                  variant="caption"
                  color={colors.onAccent}
                  numberOfLines={1}
                >
                  {step?.instruction ?? ""}
                </AppText>
              </View>
              <View style={styles.floatingSpeedPill}>
                <AppText
                  variant="small"
                  weight="extrabold"
                  color={colors.accent}
                >
                  {speed}
                </AppText>
                <AppText variant="caption" color={colors.textMuted}>
                  {speedUnit}
                </AppText>
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.scannerWrapper}>
          <RoadScanner />
        </View>
      )}

      {/* Stats Bar */}
      <View style={styles.stats}>
        <Stat
          label="Distance"
          value={formatDistance(ride.distanceTravelled, settings.units)}
        />
        <Stat label="Time" value={formatDuration(elapsed)} />
        {ride.progress ? (
          <Stat
            label="Remaining"
            value={formatDistance(
              ride.progress.distanceRemaining,
              settings.units,
            )}
          />
        ) : (
          <Stat
            label="Top speed"
            value={`${speedValue(ride.maxSpeedMps, settings.units)}`}
          />
        )}
        {eta ? (
          <Stat
            label="ETA"
            value={eta.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          />
        ) : null}
      </View>

      <Button
        label="End ride"
        icon="stop-circle"
        variant="danger"
        onPress={confirmEnd}
        style={styles.end}
      />
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="caption" color={colors.textMuted}>
        {label}
      </AppText>
      <AppText variant="heading" weight="bold">
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
  modeTabs: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  modeTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  modeTabActive: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  turnCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  turnCardArrived: {
    backgroundColor: colors.success,
  },
  turnDistance: {
    fontFamily: fonts.extrabold,
    fontSize: 38,
    lineHeight: 44,
  },
  freeCard: {
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
  },
  speedo: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 140,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  speed: {
    fontFamily: fonts.extrabold,
    fontSize: 84,
    lineHeight: 94,
    color: colors.text,
  },
  mapWrapper: {
    flex: 1,
    minHeight: 220,
    position: "relative",
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  fullMap: {
    flex: 1,
    width: "100%",
  },
  floatingTurnBadge: {
    position: "absolute",
    top: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    backgroundColor: "rgba(11, 18, 32, 0.92)",
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    padding: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  floatingSpeedPill: {
    alignItems: "center",
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scannerWrapper: {
    flex: 1,
    minHeight: 220,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  stats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  stat: {
    flexGrow: 1,
    flexBasis: "45%",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  end: {
    marginTop: spacing.xs,
  },
});
