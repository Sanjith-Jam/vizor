import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { MotionPressable, usePressMotion } from "./Motion";
import { AppText } from "./AppText";
import { colors, radius, spacing, TOUCH_TARGET } from "../../theme";

type Variant = "primary" | "secondary" | "danger" | "ghost";

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

const VARIANTS: Record<Variant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.accent, fg: colors.onAccent },
  secondary: {
    bg: colors.surfaceRaised,
    fg: colors.text,
    border: colors.border,
  },
  danger: { bg: colors.dangerStrong, fg: "#ffffff" },
  ghost: { bg: "transparent", fg: colors.accent },
};

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  disabled,
  loading,
  compact,
  style,
  accessibilityHint,
}: ButtonProps) {
  const motion = usePressMotion();
  const v = VARIANTS[variant];
  const inactive = disabled || loading;

  return (
    <MotionPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      onPressIn={motion.onPressIn}
      onPressOut={motion.onPressOut}
      style={[
        styles.base,
        compact && styles.compact,
        { backgroundColor: v.bg, borderColor: v.border ?? "transparent" },
        inactive && styles.disabled,
        style,
        motion.style,
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={v.fg} />
        ) : icon ? (
          <Ionicons name={icon} size={compact ? 18 : 22} color={v.fg} />
        ) : null}
        <AppText
          variant={compact ? "small" : "body"}
          weight="bold"
          color={v.fg}
        >
          {label}
        </AppText>
      </View>
    </MotionPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: TOUCH_TARGET,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: "center",
    alignItems: "center",
  },
  compact: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  disabled: {
    opacity: 0.4,
  },
});
