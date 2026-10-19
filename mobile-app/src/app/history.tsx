import React from "react";
import { Alert, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText, Button, Card, EmptyState, Screen, SectionTitle } from "../components/ui";
import { useHistory } from "../hooks/useHistory";
import { useSettings } from "../hooks/useSettings";
import { rideTotals } from "../history/records";
import { formatDistance, formatDuration, formatSpeed } from "../nav/geo";
import { colors, spacing } from "../theme";

export default function HistoryScreen() {
  const { rides, clearRides } = useHistory();
  const { settings } = useSettings();
  const totals = rideTotals(rides);

  if (rides.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="map"
          title="No rides yet"
          message="Start a navigation or free ride from the Ride tab. Rides longer than a minute are saved here."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.totals}>
        <Total label="Rides" value={String(totals.rides)} />
        <Total label="Distance" value={formatDistance(totals.distanceMeters, settings.units)} />
        <Total label="Time" value={formatDuration(totals.durationSeconds)} />
        <Total label="Top speed" value={formatSpeed(totals.maxSpeedMps, settings.units)} />
      </View>

      <SectionTitle>Recent rides</SectionTitle>
      {rides.map((r) => {
        const start = new Date(r.startedAt);
        return (
          <Card key={r.id} style={styles.ride}>
            <View style={styles.rideHead}>
              <Ionicons name={r.destination ? "navigate" : "speedometer"} size={20} color={colors.accent} />
              <AppText weight="bold" style={styles.flex} numberOfLines={1}>
                {r.destination ?? "Free ride"}
              </AppText>
              <AppText variant="caption" color={colors.textMuted}>
                {start.toLocaleDateString()} {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </AppText>
            </View>
            <View style={styles.rideStats}>
              <AppText variant="small" color={colors.textMuted}>
                {formatDistance(r.distanceMeters, settings.units)}
              </AppText>
              <AppText variant="small" color={colors.textMuted}>
                {formatDuration((r.endedAt - r.startedAt) / 1000)}
              </AppText>
              <AppText variant="small" color={colors.textMuted}>
                max {formatSpeed(r.maxSpeedMps, settings.units)}
              </AppText>
              {r.hazardCount ? (
                <AppText variant="small" color={colors.warning}>
                  {r.hazardCount} hazard{r.hazardCount === 1 ? "" : "s"}
                </AppText>
              ) : null}
            </View>
          </Card>
        );
      })}

      <Button
        label="Clear history"
        icon="trash-outline"
        variant="ghost"
        onPress={() =>
          Alert.alert("Clear ride history?", "This can't be undone.", [
            { text: "Cancel", style: "cancel" },
            { text: "Clear", style: "destructive", onPress: clearRides },
          ])
        }
      />
    </Screen>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <Card style={styles.total}>
      <AppText variant="caption" color={colors.textMuted}>
        {label}
      </AppText>
      <AppText variant="heading" weight="extrabold">
        {value}
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  totals: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  total: {
    flexGrow: 1,
    flexBasis: "45%",
    padding: spacing.md,
    gap: 2,
  },
  ride: {
    gap: spacing.sm,
  },
  rideHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  rideStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
});
