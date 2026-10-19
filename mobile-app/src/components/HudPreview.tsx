import React, { useEffect, useRef } from "react";
import { Platform, Animated, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { AppText, useReducedMotionPreference } from "./ui";
import { colors, fonts, radius, spacing } from "../theme";
import { NavigationDirection } from "../protocol/navigationProtocol";
import { formatDistance } from "../nav/geo";
import type { Units } from "../settings/settings";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export const DIRECTION_ICON: Record<NavigationDirection, IconName> = {
  [NavigationDirection.LEFT]: "arrow-left-top-bold",
  [NavigationDirection.RIGHT]: "arrow-right-top-bold",
  [NavigationDirection.STRAIGHT]: "arrow-up-bold",
  [NavigationDirection.U_TURN]: "arrow-u-left-top-bold",
  [NavigationDirection.DESTINATION]: "flag-checkered",
};

export const DIRECTION_LABEL: Record<NavigationDirection, string> = {
  [NavigationDirection.LEFT]: "LEFT",
  [NavigationDirection.RIGHT]: "RIGHT",
  [NavigationDirection.STRAIGHT]: "STRAIGHT",
  [NavigationDirection.U_TURN]: "U-TURN",
  [NavigationDirection.DESTINATION]: "ARRIVED",
};

/**
 * Mirrors what the helmet's 128x64 SSD1306 is showing - a glowing
 * monochrome arrow + distance on black - so the rider can sanity-check the
 * HUD from the phone.
 */
export function HudPreview({
  direction,
  distance,
  units,
  live,
}: {
  direction: NavigationDirection | null;
  distance: number;
  units: Units;
  live: boolean;
}) {
  const reduced = useReducedMotionPreference();
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduced) {
      fade.setValue(1);
      return;
    }
    fade.setValue(0.2);
    Animated.timing(fade, {
      toValue: 1,
      duration: 250,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [direction, fade, reduced]);

  return (
    <View style={styles.bezel} accessibilityLabel="Helmet display preview">
      <View style={styles.screen}>
        {direction === null ? (
          <View style={styles.idle}>
            <MaterialCommunityIcons
              name="motorbike"
              size={40}
              color={colors.hudGlow}
            />
            <AppText variant="small" color={colors.hudGlow} style={styles.mono}>
              READY
            </AppText>
          </View>
        ) : (
          <Animated.View style={[styles.frame, { opacity: fade }]}>
            <MaterialCommunityIcons
              name={DIRECTION_ICON[direction]}
              size={64}
              color={colors.hudGlow}
            />
            <View style={styles.readout}>
              <AppText
                variant="caption"
                color={colors.hudGlow}
                style={styles.mono}
              >
                {DIRECTION_LABEL[direction]}
              </AppText>
              {direction !== NavigationDirection.DESTINATION ? (
                <AppText
                  variant="title"
                  color={colors.hudGlow}
                  style={styles.mono}
                >
                  {formatDistance(distance, units)}
                </AppText>
              ) : null}
            </View>
          </Animated.View>
        )}
      </View>
      <View style={styles.footer}>
        <View
          style={[
            styles.liveDot,
            { backgroundColor: live ? colors.success : colors.textFaint },
          ]}
        />
        <AppText variant="caption" color={colors.onDarkMuted}>
          {live ? "Live on helmet" : "Preview - helmet not connected"}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bezel: {
    backgroundColor: "#05080F",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  screen: {
    aspectRatio: 2,
    backgroundColor: "#000000",
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#0F2A2A",
  },
  idle: {
    alignItems: "center",
    gap: spacing.xs,
  },
  frame: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  readout: {
    gap: 2,
  },
  mono: {
    fontFamily: fonts.bold,
    letterSpacing: 1.5,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
