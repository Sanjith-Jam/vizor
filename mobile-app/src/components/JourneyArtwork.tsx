import React, { useEffect, useRef } from "react";
import { Platform, Animated, Easing, View } from "react-native";
import { useIsFocused } from "expo-router";
import Svg, { Circle, Ellipse, Path, G } from "react-native-svg";
import { useReducedMotionPreference } from "./ui/Motion";

/** Original riding illustrations; decorative motion stops off-screen. */
export function JourneyArtwork({
  kind = "route",
  size = 150,
  animated = false,
}: {
  kind?: "route" | "helmet" | "road";
  size?: number;
  animated?: boolean;
}) {
  const reduced = useReducedMotionPreference();
  const focused = useIsFocused();
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!animated || reduced || !focused) {
      drift.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animated, reduced, focused, drift]);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      <Animated.View
        style={{
          transform: [
            {
              translateY: drift.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -6],
              }),
            },
          ],
        }}
      >
        <Svg width={size} height={size} viewBox="0 0 200 200" fill="none">
          {kind === "helmet" ? (
            <G>
              <Ellipse cx="99" cy="171" rx="61" ry="7" fill="#E8E8E4" />
              <Path
                d="M35 108C35 54 65 27 107 27c40 0 66 28 66 68l-13 48-52 18-44-10-26-24Z"
                fill="#22221F"
              />
              <Path d="m59 70 95-2 12 35-82 15-37-13Z" fill="#F5F5F3" />
              <Path d="m85 79 59-3 6 16-63 12Z" fill="#D9D9D2" />
              <Path d="m113 126 48-13-7 21-41 14Z" fill="#F5F5F3" />
              <Circle cx="58" cy="120" r="7" stroke="#F5F5F3" strokeWidth="3" />
              <Path
                d="m95 17 3-9m-47 27-7-7m113 8 8-8"
                stroke="#22221F"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </G>
          ) : kind === "road" ? (
            <G>
              <Ellipse cx="100" cy="164" rx="71" ry="9" fill="#E8E8E4" />
              <Path d="m77 38-42 119h130L122 38Z" fill="#252522" />
              <Path
                d="m98 45-1 20m3 14v24m1 14 2 26"
                stroke="#FFF"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <Ellipse cx="129" cy="132" rx="21" ry="9" fill="#F5F5F3" />
              <Ellipse cx="128" cy="129" rx="16" ry="6" fill="#A7A7A0" />
              <Circle
                cx="51"
                cy="62"
                r="18"
                fill="#FFF"
                stroke="#252522"
                strokeWidth="2"
              />
              <Path
                d="M51 53v12m0 5v1"
                stroke="#252522"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <Path d="m153 57 4-6 4 6-4 6Z" fill="#252522" />
            </G>
          ) : (
            <G>
              <Ellipse cx="100" cy="168" rx="67" ry="7" fill="#E8E8E4" />
              <Path
                d="M49 153c-31-34 67-26 79-53S57 87 71 58"
                stroke="#DADAD4"
                strokeWidth="21"
                strokeLinecap="round"
              />
              <Path
                d="M49 153c-31-34 67-26 79-53S57 87 71 58"
                stroke="#22221F"
                strokeWidth="2"
                strokeDasharray="5 7"
              />
              <Circle cx="49" cy="153" r="7" fill="#22221F" />
              <Path
                d="M71 15c-18 0-31 13-31 30 0 21 31 44 31 44s31-23 31-44c0-17-13-30-31-30Z"
                fill="#22221F"
              />
              <Circle cx="71" cy="44" r="10" fill="#F5F5F3" />
              <Path d="m139 38 15 9-15 9 4-9Z" fill="#22221F" />
              <Circle cx="164" cy="94" r="4" fill="#22221F" />
            </G>
          )}
        </Svg>
      </Animated.View>
    </View>
  );
}
