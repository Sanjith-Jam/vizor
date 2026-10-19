import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { AppText, Banner, Button, Card, Screen, SectionTitle } from "../components/ui";
import { DIRECTION_ICON, DIRECTION_LABEL, HudPreview } from "../components/HudPreview";
import { useHelmetConnection } from "../hooks/useHelmetConnection";
import { useSettings } from "../hooks/useSettings";
import { NavigationDirection } from "../protocol/navigationProtocol";
import { HAZARD_LABEL } from "../history/records";
import { simulateIncomingCall, simulateEndCall } from "../telephony/CallObserver";
import { colors, fonts, radius, spacing } from "../theme";

const DIRECTIONS = [
  NavigationDirection.LEFT,
  NavigationDirection.STRAIGHT,
  NavigationDirection.RIGHT,
  NavigationDirection.U_TURN,
  NavigationDirection.DESTINATION,
];
const DISTANCE_STEPS = [-100, -10, 10, 100];

/**
 * Sends raw navigation packets to verify the BLE link end to end, and shows
 * the packet log both ways. For bench testing the helmet without a route.
 */
export default function DeveloperScreen() {
  const { connection, status, lastHazardEvent, packetLog } = useHelmetConnection();
  const { settings } = useSettings();
  const [distance, setDistance] = useState(100);
  const [lastSent, setLastSent] = useState<NavigationDirection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const disabled = status !== "connected";

  const send = async (direction: NavigationDirection) => {
    setError(null);
    try {
      await connection.sendNavigation(direction, distance);
      setLastSent(direction);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Screen>
      {disabled ? <Banner tone="warning" title="Helmet not connected" message="Connect from the Helmet tab to send packets." /> : null}
      {error ? <Banner tone="danger" title="Send failed" message={error} /> : null}

      <HudPreview direction={lastSent} distance={distance} units={settings.units} live={!disabled} />

      <SectionTitle>Distance</SectionTitle>
      <Card style={styles.distanceCard}>
        <AppText variant="display" weight="extrabold" align="center">
          {distance} m
        </AppText>
        <View style={styles.steps}>
          {DISTANCE_STEPS.map((d) => (
            <Pressable
              key={d}
              accessibilityRole="button"
              accessibilityLabel={`${d > 0 ? "Add" : "Subtract"} ${Math.abs(d)} metres`}
              onPress={() => setDistance((v) => Math.min(65_535, Math.max(0, v + d)))}
              style={styles.stepButton}
            >
              <AppText weight="bold">{d > 0 ? `+${d}` : d}</AppText>
            </Pressable>
          ))}
        </View>
      </Card>

      <SectionTitle>Send arrow</SectionTitle>
      <View style={styles.grid}>
        {DIRECTIONS.map((d) => (
          <Pressable
            key={d}
            accessibilityRole="button"
            accessibilityLabel={`Send ${DIRECTION_LABEL[d]}`}
            disabled={disabled}
            onPress={() => void send(d)}
            style={({ pressed }) => [styles.dirButton, disabled && styles.disabled, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name={DIRECTION_ICON[d]} size={36} color={colors.accent} />
            <AppText variant="caption" weight="bold">
              {DIRECTION_LABEL[d]}
            </AppText>
          </Pressable>
        ))}
      </View>

      <SectionTitle>Last hazard event</SectionTitle>
      <Card>
        {lastHazardEvent ? (
          <>
            <AppText weight="bold">{HAZARD_LABEL[lastHazardEvent.type]}</AppText>
            <AppText variant="small" color={colors.textMuted}>
              {lastHazardEvent.gForce.toFixed(2)} g ·{" "}
              {lastHazardEvent.hasGpsFix
                ? `${lastHazardEvent.lat.toFixed(6)}, ${lastHazardEvent.lon.toFixed(6)}`
                : "No GPS fix"}
            </AppText>
          </>
        ) : (
          <AppText color={colors.textMuted}>None received yet.</AppText>
        )}
      </Card>

      <SectionTitle>Telephony & Call Relay Test</SectionTitle>
      <Card style={styles.distanceCard}>
        <AppText variant="small" color={colors.textMuted}>
          Test the phone-to-helmet incoming call alert, voice prompt, and helmet PTT answer/decline relay.
        </AppText>
        <View style={styles.steps}>
          <Button
            label="Simulate call: Mom"
            icon="call"
            compact
            onPress={() => simulateIncomingCall("Mom")}
          />
          <Button
            label="End call"
            variant="ghost"
            compact
            onPress={() => simulateEndCall()}
          />
        </View>
      </Card>

      <SectionTitle>Packet log</SectionTitle>
      <Card style={styles.log}>
        {packetLog.length === 0 ? (
          <AppText variant="small" color={colors.textMuted}>
            No packets yet.
          </AppText>
        ) : (
          packetLog.map((p, i) => (
            <AppText key={`${p.at}-${i}`} variant="caption" style={styles.mono} color={p.direction === "tx" ? colors.accent : colors.warning}>
              {new Date(p.at).toLocaleTimeString()} {p.direction === "tx" ? "→" : "←"} {p.channel.padEnd(11)} {p.hex}
            </AppText>
          ))
        )}
      </Card>
      <Button label="Disconnect" variant="ghost" disabled={disabled} onPress={() => void connection.disconnect()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  distanceCard: {
    gap: spacing.md,
  },
  steps: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  stepButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  dirButton: {
    flexBasis: "31%",
    flexGrow: 1,
    minHeight: 96,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    backgroundColor: colors.accentDim,
  },
  log: {
    gap: 2,
  },
  mono: {
    fontFamily: fonts.medium,
  },
});
