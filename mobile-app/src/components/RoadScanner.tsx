import React, { useEffect, useState } from "react";
import { View, Image, StyleSheet } from "react-native";
import { AppText, Button, Card, Screen } from "./ui";
import { useCloud, cloud } from "../cloud/useCloud";
import { colors, spacing } from "../theme";
import { useRouter } from "expo-router";
export interface RoadScannerProps {
  onClose?: () => void;
  compact?: boolean;
}
export function RoadScanner({ onClose, compact = false }: RoadScannerProps) {
  const router = useRouter();
  const { telemetry, refresh } = useCloud();
  const [url, setUrl] = useState<string | null>(null),
    [error, setError] = useState(""),
    [observation, setObservation] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    setObservation(null);
    if (telemetry?.evidence_path && cloud)
      void cloud
        .from("observations")
        .select("confidence,model_revision,observed_at,accuracy_m,g_force")
        .eq("evidence_path", telemetry.evidence_path)
        .order("observed_at", { ascending: false })
        .limit(1)
        .then(({ data }) => {
          if (alive) setObservation(data?.[0] || null);
        });
    if (telemetry?.evidence_path && cloud)
      void cloud.storage
        .from("evidence")
        .createSignedUrl(telemetry.evidence_path, 120)
        .then(({ data, error }) => {
          if (alive) {
            setUrl(data?.signedUrl || null);
            if (error) setError(error.message);
          }
        });
    return () => {
      alive = false;
    };
  }, [telemetry]);
  return (
    <View style={[styles.container, compact && { minHeight: 260 }]}>
      <AppText variant="title" weight="bold">
        Road vision.
      </AppText>
      <AppText variant="caption" color={colors.accent}>
        {telemetry?.source === "replay"
          ? "RECORDED REPLAY"
          : telemetry?.camera &&
              Date.now() - Date.parse(telemetry.recorded_at) < 60000
            ? "BANANA PI CAMERA FEED"
            : "NO LIVE CAMERA CONNECTED"}
      </AppText>
      {url ? (
        <Image
          source={{ uri: url }}
          style={styles.image}
          resizeMode="contain"
          accessibilityLabel="Latest private camera evidence"
        />
      ) : (
        <Card>
          <AppText>Connect the Banana Pi to see real inference.</AppText>
          <AppText variant="small" color={colors.textMuted}>
            This screen does not generate synthetic detections. Uploaded
            evidence, model output and performance arrive from your registered
            device.
          </AppText>
        </Card>
      )}
      <AppText variant="small" color={colors.textMuted}>
        {observation
          ? `${observation.confidence == null ? "Confidence unavailable" : Math.round(observation.confidence * 100) + "% pothole confidence"} · ${observation.model_revision || "Model unknown"}\nGPS accuracy: ${observation.accuracy_m == null ? "unknown" : "±" + observation.accuracy_m + " m"}${observation.g_force == null ? "" : " · Measured motion: " + observation.g_force + " g"}`
          : "No observation metadata yet."}
      </AppText>
      <AppText variant="small" color={colors.textMuted}>
        Inference: {telemetry?.fps?.toFixed(1) ?? "—"} FPS · Latency:{" "}
        {telemetry?.latency_ms != null
          ? `${Math.round(telemetry.latency_ms)}ms`
          : "—"}{" "}
        · Battery:{" "}
        {telemetry?.battery_percent != null
          ? `${telemetry.battery_percent}%`
          : "unavailable"}
      </AppText>
      {error ? <AppText color={colors.danger}>{error}</AppText> : null}
      <Button
        label="Connected photo demo"
        icon="images-outline"
        onPress={() => router.push("/live-demo")}
      />
      <Button
        label="Refresh device feed"
        icon="refresh"
        variant="secondary"
        onPress={() => void refresh()}
      />
      {onClose ? (
        <Button label="Back to ride" variant="ghost" onPress={onClose} />
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  image: {
    width: "100%",
    height: 260,
    backgroundColor: colors.surface,
    borderRadius: 12,
  },
});
