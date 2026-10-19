import React from "react";
import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform, Animated, type ColorValue } from "react-native";
import { useEffect, useRef } from "react";
import { useReducedMotionPreference } from "../../components/ui/Motion";
import { useSettings } from "../../hooks/useSettings";
import { useHelmetConnection } from "../../hooks/useHelmetConnection";
import { colors, fonts } from "../../theme";

type IconName = keyof typeof Ionicons.glyphMap;

function icon(name: IconName, focusedName: IconName) {
  return ({
    color,
    focused,
    size,
  }: {
    color: ColorValue;
    focused: boolean;
    size: number;
  }) => (
    <TabIcon
      name={focused ? focusedName : name}
      focused={focused}
      size={size}
      color={color as string}
    />
  );
}

function TabIcon({
  name,
  focused,
  size,
  color,
}: {
  name: IconName;
  focused: boolean;
  size: number;
  color: string;
}) {
  const reduced = useReducedMotionPreference();
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) {
      scale.setValue(1);
      return;
    }
    const animation = Animated.spring(scale, {
      toValue: focused ? 1.08 : 1,
      speed: 24,
      bounciness: 7,
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start();
    return () => animation.stop();
  }, [focused, reduced, scale]);
  return (
    <Animated.View
      style={{
        paddingHorizontal: 19,
        paddingVertical: 5,
        borderRadius: 24,
        backgroundColor: focused ? colors.accentDim : "transparent",
        transform: [{ scale }],
      }}
    >
      <Ionicons name={name} size={size - 2} color={color} />
    </Animated.View>
  );
}

export default function TabsLayout() {
  const { settings } = useSettings();
  const { status } = useHelmetConnection();
  const insets = useSafeAreaInsets();

  if (!settings.onboardingDone) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 80 + insets.bottom,
          paddingTop: 10,
          paddingBottom: insets.bottom + 9,
        },
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 12 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Ride",
          tabBarIcon: icon("speedometer-outline", "speedometer"),
        }}
      />
      <Tabs.Screen
        name="hazards"
        options={{
          title: "Hazards",
          tabBarIcon: icon("warning-outline", "warning"),
        }}
      />
      <Tabs.Screen
        name="helmet"
        options={{
          title: "Helmet",
          tabBarIcon: icon("bluetooth-outline", "bluetooth"),
          tabBarBadge:
            status === "connected"
              ? undefined
              : status === "reconnecting"
                ? "…"
                : "!",
          tabBarBadgeStyle: {
            color: "#FFFFFF",
            backgroundColor:
              status === "reconnecting" ? colors.warning : colors.danger,
          },
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Profile",
          tabBarIcon: icon("person-outline", "person"),
        }}
      />
    </Tabs>
  );
}
