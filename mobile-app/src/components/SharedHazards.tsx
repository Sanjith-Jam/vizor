import React, { useEffect, useState } from "react";
import * as Location from "expo-location";
import { enqueueObservation, syncObservations } from "../cloud/queue";
import { View } from "react-native";
import { AppText, Button, Card, MotionPressable } from "./ui";
import { MapCanvas } from "./MapCanvas";
import { useCloud, cloudApi } from "../cloud/useCloud";
import { useRide } from "../hooks/useRide";
import type { Point, Pothole } from "../../../shared/contracts";
import { colors, spacing } from "../theme";
export function SharedHazards() {
  const { session, hazards, error, loadHazards, refresh } = useCloud();
  const ride = useRide();
  const [layer, setLayer] = useState<
    "all" | "corroborated" | "suspected" | "repaired"
  >("all");
  const visibleHazards =
    layer === "all"
      ? hazards
      : hazards.filter((hazard) => hazard.status === layer);
  const [here, setHere] = useState<Point | null>(null),
    [selected, setSelected] = useState<Pothole | null>(null),
    [message, setMessage] = useState("");
  const locate = async () => {
    const p = await ride.getCurrentPosition();
    if (p) {
      setHere(p);
      await loadHazards(p);
    }
  };
  useEffect(() => {
    if (session) void locate();
  }, [session]);
  const reportHere = async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted)
        throw new Error("Allow location access to report a hazard.");
      const p = await Location.getCurrentPositionAsync();
      await enqueueObservation({
        eventId: `manual-${Date.now()}`,
        source: "manual",
        observedAt: new Date(p.timestamp).toISOString(),
        location: { lat: p.coords.latitude, lon: p.coords.longitude },
        accuracyMeters: p.coords.accuracy,
        confidence: null,
      });
      await syncObservations();
      setMessage("Observation saved; offline uploads retry automatically.");
      await refresh();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  const report = async (verdict: string) => {
    if (!selected) return;
    try {
      await cloudApi("report", { id: selected.id, verdict });
      setMessage("Report saved. Repair status requires corroboration.");
      await refresh();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  return (
    <View style={{ gap: spacing.md }}>
      <AppText variant="heading">Shared road intelligence</AppText>
      <AppText variant="small" color={colors.textMuted}>
        {session
          ? "Approximate reports from the shared database. Sightings are candidates, not proof of one physical pothole."
          : "Sign in on Profile to load shared potholes. Your personal sensor log is below."}
      </AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(["all", "corroborated", "suspected", "repaired"] as const).map(
          (value) => (
            <MotionPressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: layer === value }}
              accessibilityLabel={`${value === "all" ? "All reports" : value[0].toUpperCase() + value.slice(1)}${layer === value ? ", selected" : ""}`}
              onPress={() => setLayer(value)}
              style={{
                minHeight: 44,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 24,
                backgroundColor:
                  layer === value ? colors.accent : colors.surface,
              }}
            >
              <AppText
                variant="small"
                weight="semibold"
                color={layer === value ? colors.onAccent : colors.text}
              >
                {value === "all"
                  ? "All reports"
                  : value[0].toUpperCase() + value.slice(1)}
              </AppText>
            </MotionPressable>
          ),
        )}
      </View>
      <MapCanvas
        riderPosition={here}
        destination={null}
        potholes={visibleHazards}
        onHazard={setSelected}
        style={{ height: 280 }}
      />
      <Button
        label="Report a pothole here"
        disabled={!session}
        icon="alert-circle-outline"
        onPress={() => void reportHere()}
      />
      <Button
        label="Refresh nearby reports"
        variant="secondary"
        disabled={!session}
        onPress={() => void locate()}
      />
      {selected ? (
        <Card>
          <AppText weight="bold">
            {selected.status.toUpperCase()} · {selected.sightings} sightings
          </AppText>
          <AppText variant="small">
            ±{selected.uncertainty_m} m · Last seen{" "}
            {new Date(selected.last_seen).toLocaleDateString()}
          </AppText>
          <View style={{ gap: 8 }}>
            <Button
              compact
              label="Still present"
              onPress={() => void report("present")}
            />
            <Button
              compact
              label="Looks repaired"
              variant="secondary"
              onPress={() => void report("repaired")}
            />
            <Button
              compact
              label="Dispute report"
              variant="ghost"
              onPress={() => void report("incorrect")}
            />
          </View>
        </Card>
      ) : null}
      {message || error ? (
        <AppText variant="small" color={colors.textMuted}>
          {message || error}
        </AppText>
      ) : null}
    </View>
  );
}
