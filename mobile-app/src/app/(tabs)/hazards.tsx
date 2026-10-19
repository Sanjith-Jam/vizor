import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Linking,
  Pressable,
  Share,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AppText, Button, EmptyState, Entrance } from "../../components/ui";
import { useHistory } from "../../hooks/useHistory";
import {
  HAZARD_LABEL,
  hazardsToCsv,
  type HazardRecord,
} from "../../history/records";
import { HazardEventType } from "../../protocol/hazardProtocol";
import { mapsUrl } from "../../sos/crashMessage";
import { colors, radius, spacing } from "../../theme";

import { SharedHazards } from "../../components/SharedHazards";

type Filter = "all" | HazardEventType;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: HazardEventType.POTHOLE_BUMP, label: "Potholes" },
  { key: HazardEventType.CRASH_DETECTED, label: "Crashes" },
];

const TYPE_STYLE: Record<
  HazardEventType,
  { icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  [HazardEventType.POTHOLE_BUMP]: {
    icon: "alert-circle",
    color: colors.warning,
  },
  [HazardEventType.CRASH_DETECTED]: { icon: "medkit", color: colors.danger },
  [HazardEventType.SOS_CANCELLED]: {
    icon: "shield-checkmark",
    color: colors.success,
  },
};

export default function HazardsScreen() {
  const { hazards, clearHazards } = useHistory();
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(
    () =>
      filter === "all" ? hazards : hazards.filter((h) => h.type === filter),
    [hazards, filter],
  );
  const potholes = hazards.filter(
    (h) => h.type === HazardEventType.POTHOLE_BUMP,
  ).length;
  const crashes = hazards.filter(
    (h) => h.type === HazardEventType.CRASH_DETECTED,
  ).length;

  const exportCsv = () => {
    void Share.share({ title: "Hazard log", message: hazardsToCsv(visible) });
  };

  const confirmClear = () => {
    Alert.alert(
      "Clear hazard log?",
      "This deletes every recorded hazard on this phone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: clearHazards },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <AppText variant="display" weight="bold">
              road reports.
            </AppText>
            <AppText color={colors.textMuted}>
              Know the road. Share what matters.
            </AppText>
            <SharedHazards />
            <AppText variant="heading" weight="bold">
              your observations.
            </AppText>
            <AppText variant="small" color={colors.textMuted}>
              Your private motion-sensor log. An IMU bump alone does not verify
              a pothole.
            </AppText>
            <View style={styles.stats}>
              <Stat value={potholes} label="Potholes" color={colors.warning} />
              <Stat value={crashes} label="Crashes" color={colors.danger} />
              <Stat
                value={hazards.length}
                label="Total"
                color={colors.accent}
              />
            </View>
            <View style={styles.chips}>
              {FILTERS.map((f) => (
                <Pressable
                  key={String(f.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: filter === f.key }}
                  onPress={() => setFilter(f.key)}
                  style={[styles.chip, filter === f.key && styles.chipActive]}
                >
                  <AppText
                    variant="small"
                    weight="semibold"
                    color={filter === f.key ? colors.onAccent : colors.text}
                  >
                    {f.label}
                  </AppText>
                </Pressable>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="shield-checkmark"
            title="No hazards yet"
            message="Your helmet’s sensor events will appear here after a ride. A bump alone does not verify a pothole."
          />
        }
        renderItem={({ item }) => <HazardRow item={item} />}
        ListFooterComponent={
          hazards.length > 0 ? (
            <View style={styles.footer}>
              <Button
                label="Export CSV"
                icon="share-outline"
                variant="secondary"
                onPress={exportCsv}
              />
              <Button
                label="Clear log"
                icon="trash-outline"
                variant="ghost"
                onPress={confirmClear}
              />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function Stat({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  return (
    <View style={styles.stat}>
      <AppText variant="title" weight="extrabold" color={color}>
        {value}
      </AppText>
      <AppText variant="caption" color={colors.textMuted}>
        {label}
      </AppText>
    </View>
  );
}

function HazardRow({ item }: { item: HazardRecord }) {
  const t = TYPE_STYLE[item.type];
  const when = new Date(item.at);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${HAZARD_LABEL[item.type]} at ${when.toLocaleString()}`}
      disabled={!item.hasGpsFix}
      onPress={() => void Linking.openURL(mapsUrl(item.lat, item.lon))}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
    >
      <View style={[styles.rowIcon, { backgroundColor: t.color + "22" }]}>
        <Ionicons name={t.icon} size={22} color={t.color} />
      </View>
      <View style={styles.flex}>
        <AppText weight="semibold">{HAZARD_LABEL[item.type]}</AppText>
        <AppText variant="small" color={colors.textMuted}>
          {when.toLocaleDateString()}{" "}
          {when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{" "}
          · {item.gForce.toFixed(1)} g
        </AppText>
        <AppText variant="caption" color={colors.textFaint}>
          {item.hasGpsFix
            ? `${item.lat.toFixed(5)}, ${item.lon.toFixed(5)}`
            : "No GPS fix"}
        </AppText>
      </View>
      {item.hasGpsFix ? (
        <Ionicons name="map-outline" size={20} color={colors.accent} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  headerBlock: {
    gap: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  stats: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: "center",
  },
  chips: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  chip: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: "center",
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  flex: {
    flex: 1,
    gap: 2,
  },
  footer: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
