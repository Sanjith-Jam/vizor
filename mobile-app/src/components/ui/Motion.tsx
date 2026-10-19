import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Platform,
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useReducedMotion } from "react-native-reanimated";

const MotionContext = createContext(true);
export function MotionProvider({ children }: { children: React.ReactNode }) {
  const initial = useReducedMotion();
  const [reduced, setReduced] = useState(initial);
  useEffect(() => {
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => sub.remove();
  }, []);
  return (
    <MotionContext.Provider value={reduced}>{children}</MotionContext.Provider>
  );
}
export const useReducedMotionPreference = () => useContext(MotionContext);
export const MotionPressable = Animated.createAnimatedComponent(Pressable);

export function usePressMotion() {
  const reduced = useReducedMotionPreference();
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) scale.setValue(1);
  }, [reduced, scale]);
  const move = (toValue: number) => {
    if (reduced) return;
    Animated.spring(scale, {
      toValue,
      speed: 35,
      bounciness: 5,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  };
  return {
    onPressIn: () => move(0.965),
    onPressOut: () => move(1),
    style: { transform: [{ scale }] },
  };
}
export function Entrance({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotionPreference();
  const progress = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      progress.stopAnimation();
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      delay,
      duration: 480,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start();
    return () => animation.stop();
  }, [progress, delay, reduced]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [18, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
