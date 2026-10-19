import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Platform, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused, useRouter } from "expo-router";
import {
  AppText,
  Button,
  Card,
  MotionPressable,
  useReducedMotionPreference,
} from "./ui";
import { weeklyActivity, type RideRecord } from "../history/records";
import { formatDistance, formatDuration } from "../nav/geo";
import type { Units } from "../settings/settings";
import { colors, radius, spacing } from "../theme";

export function RideActivity({
  rides,
  units,
}: {
  rides: RideRecord[];
  units: Units;
}) {
  const [week, setWeek] = useState<0 | -1>(0);
  const activity = useMemo(() => weeklyActivity(rides, week), [rides, week]);
  const reduced = useReducedMotionPreference(),
    focused = useIsFocused();
  const reveal = useRef(new Animated.Value(1)).current;
  const router = useRouter();
  useEffect(() => {
    if (reduced || !focused) {
      reveal.setValue(1);
      return;
    }
    reveal.setValue(0);
    const animation = Animated.spring(reveal, {
      toValue: 1,
      damping: 18,
      stiffness: 90,
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start();
    return () => animation.stop();
  }, [week, reduced, focused, reveal]);
  const max = Math.max(1, ...activity.days.map((day) => day.distanceMeters));
  return (
    <Card>
      <View style={styles.top}>
        <AppText variant="heading" weight="bold">
          Your rhythm
        </AppText>
        <Ionicons
          name="stats-chart-outline"
          size={22}
          color={colors.textMuted}
        />
      </View>
      <View style={styles.switcher}>
        {(
          [
            { label: "This week", value: 0 },
            { label: "Last week", value: -1 },
          ] as const
        ).map((item) => (
          <MotionPressable
            key={item.value}
            accessibilityRole="button"
            accessibilityState={{ selected: week === item.value }}
            accessibilityLabel={`${item.label}${week === item.value ? ", selected" : ""}`}
            onPress={() => setWeek(item.value)}
            style={[styles.period, week === item.value && styles.selected]}
          >
            <AppText
              variant="small"
              weight="semibold"
              color={week === item.value ? colors.text : colors.textMuted}
            >
              {item.label}
            </AppText>
          </MotionPressable>
        ))}
      </View>
      <View style={styles.total}>
        <AppText variant="title" weight="bold">
          {formatDistance(activity.distanceMeters, units)}
        </AppText>
        <AppText variant="small" color={colors.textMuted}>
          {activity.rides} {activity.rides === 1 ? "ride" : "rides"} ·{" "}
          {formatDuration(activity.durationSeconds)}
        </AppText>
      </View>
      <View
        style={styles.chart}
        accessibilityLabel="Saved ride distance by day"
      >
        {activity.days.map((day, index) => (
          <View
            key={index}
            style={styles.column}
            accessible
            accessibilityLabel={`${day.date.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}: ${formatDistance(day.distanceMeters, units)}, ${day.rides} rides`}
          >
            <View style={styles.track}>
              <Animated.View
                style={[
                  styles.bar,
                  {
                    height: day.distanceMeters
                      ? 12 + (day.distanceMeters / max) * 68
                      : 3,
                    backgroundColor: day.distanceMeters
                      ? colors.accent
                      : colors.border,
                    opacity: reveal,
                    transform: [{ scaleY: reveal }],
                  },
                ]}
              />
            </View>
            <AppText variant="caption" color={colors.textMuted}>
              {["M", "T", "W", "T", "F", "S", "S"][index]}
            </AppText>
          </View>
        ))}
      </View>
      {!activity.rides && (
        <AppText variant="small" color={colors.textMuted}>
          Your first saved ride starts this story.
        </AppText>
      )}
      <Button
        label="View ride history"
        variant="ghost"
        compact
        onPress={() => router.push("/history")}
      />
    </Card>
  );
}
const styles = StyleSheet.create({
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  switcher: {
    flexDirection: "row",
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
  },
  period: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    borderRadius: radius.pill,
  },
  selected: { backgroundColor: colors.surface },
  total: { gap: 4, marginTop: spacing.sm },
  chart: { flexDirection: "row", gap: 12 },
  column: { flex: 1, alignItems: "center", gap: 8 },
  track: {
    height: 88,
    width: "100%",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  bar: { width: "65%", borderRadius: 6, minWidth: 8 },
});
