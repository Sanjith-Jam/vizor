import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "expo-router";
import { useReducedMotionPreference } from "./ui";
import { colors } from "../theme";

/** The pulse means listening/processing only; idle never imitates recording. */
export function AssistantOrb({
  active = false,
  size = 64,
}: {
  active?: boolean;
  size?: number;
}) {
  const reduced = useReducedMotionPreference(),
    focused = useIsFocused();
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active || reduced || !focused) {
      pulse.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 750,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 750,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [active, reduced, focused, pulse]);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size + 20,
        height: size + 20,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Animated.View
        style={{
          position: "absolute",
          width: size + 18,
          height: size + 18,
          borderRadius: size,
          borderWidth: 1,
          borderColor: colors.text + "35",
          transform: [
            {
              scale: pulse.interpolate({
                inputRange: [0, 1],
                outputRange: [0.9, 1.15],
              }),
            },
          ],
          opacity: pulse.interpolate({
            inputRange: [0, 1],
            outputRange: [0.6, 0.1],
          }),
        }}
      />
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.accent,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons
          name={active ? "radio" : "mic-outline"}
          size={size * 0.43}
          color={colors.onAccent}
        />
      </View>
    </View>
  );
}
