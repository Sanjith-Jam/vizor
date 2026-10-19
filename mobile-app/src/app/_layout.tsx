import React, { useEffect } from "react";
import { useRouter } from "expo-router";
import { useHelmetConnection } from "../hooks/useHelmetConnection";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
  DMSans_800ExtraBold,
} from "@expo-google-fonts/dm-sans";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { HelmetConnectionProvider } from "../hooks/useHelmetConnection";
import { SettingsProvider, useSettings } from "../hooks/useSettings";
import { HistoryProvider } from "../hooks/useHistory";
import { RideProvider } from "../hooks/useRide";
import { useCallRelay } from "../hooks/useCallRelay";
import { CrashOverlay } from "../components/CrashOverlay";
import { UpdateGate } from "../update/UpdateGate";
import { CloudProvider } from "../cloud/useCloud";
import {
  MotionProvider,
  useReducedMotionPreference,
} from "../components/ui/Motion";
import { colors, fonts } from "../theme";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function AppShell() {
  // Mounted once at the root: relays native call state <-> the helmet for
  // the whole app, regardless of which screen is showing.
  useCallRelay();
  const router = useRouter();
  const { connection } = useHelmetConnection();
  useEffect(
    () =>
      connection.onPushToTalk.on(() =>
        router.push({
          pathname: "/assistant",
          params: { listen: String(Date.now()) },
        }),
      ),
    [connection, router],
  );
  const { loaded } = useSettings();
  const reducedMotion = useReducedMotionPreference();
  const [fontsLoaded, fontError] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    DMSans_800ExtraBold,
  });
  const ready = loaded && (fontsLoaded || !!fontError);

  useEffect(() => {
    if (ready) {
      void SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: fonts.bold },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: reducedMotion ? "none" : "fade_from_bottom",
          animationDuration: 300,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="onboarding"
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen name="navigate" options={{ title: "Where to?" }} />
        <Stack.Screen
          name="ride"
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="contacts"
          options={{ title: "Emergency contacts" }}
        />
        <Stack.Screen name="history" options={{ title: "Ride history" }} />
        <Stack.Screen name="developer" options={{ title: "Developer tools" }} />
        <Stack.Screen
          name="assistant"
          options={{ title: "Ask Vizor", presentation: "modal" }}
        />
        <Stack.Screen name="account" options={{ title: "Your profile" }} />
        <Stack.Screen name="scan-road" options={{ headerShown: false }} />
        <Stack.Screen name="live-demo" options={{ headerShown: false }} />
      </Stack>
      {/* Update gate covers the app when a newer release exists; CrashOverlay
          renders after it so a crash alert is never hidden behind it. */}
      <UpdateGate />
      <CrashOverlay />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <MotionProvider>
        <SettingsProvider>
          <HelmetConnectionProvider>
            <CloudProvider>
              <HistoryProvider>
                <RideProvider>
                  <AppShell />
                </RideProvider>
              </HistoryProvider>
            </CloudProvider>
          </HelmetConnectionProvider>
        </SettingsProvider>
      </MotionProvider>
    </SafeAreaProvider>
  );
}
