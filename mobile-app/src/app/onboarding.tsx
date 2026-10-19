import React, { useCallback, useState } from "react";
import { Linking, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { AppText, Banner, Button, Entrance } from "../components/ui";
import { requestBlePermissions } from "../ble/permissions";
import { useSettings } from "../hooks/useSettings";
import { loadContacts } from "../sos/contactsStore";
import { JourneyArtwork } from "../components/JourneyArtwork";
import { colors, radius, spacing } from "../theme";

type Step = 0 | 1 | 2 | 3;

export default function Onboarding() {
  const router = useRouter();
  const { update } = useSettings();
  const [step, setStep] = useState<Step>(0);
  const [permState, setPermState] = useState<
    "idle" | "granted" | "denied" | "blocked"
  >("idle");
  const [contactCount, setContactCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      loadContacts()
        .then((c) => setContactCount(c.length))
        .catch(() => undefined);
    }, []),
  );

  const askPermissions = async () => {
    const ble = await requestBlePermissions();
    const loc = await Location.requestForegroundPermissionsAsync().catch(
      () => null,
    );
    if (ble === "granted" && loc?.granted) {
      setPermState("granted");
      setStep(2);
    } else {
      setPermState(
        ble === "blocked" || (loc && !loc.canAskAgain) ? "blocked" : "denied",
      );
    }
  };

  const finish = (then: "/" | "/helmet") => {
    update({ onboardingDone: true });
    router.replace(then);
  };

  return (
    <SafeAreaView style={styles.container}>
      <AppText variant="heading" weight="extrabold" align="center">
        vizor.
      </AppText>
      <View style={styles.dots}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.dot, i <= step && styles.dotActive]} />
        ))}
      </View>

      {step === 0 ? (
        <Page
          key={step}
          icon={<JourneyArtwork kind="helmet" size={200} animated />}
          title={"a clearer way\nto ride."}
          body="Turn-by-turn arrows on your visor, pothole alerts, and crash SOS - all without looking at your phone."
        >
          <Button
            label="Get started"
            icon="arrow-forward"
            onPress={() => setStep(1)}
          />
        </Page>
      ) : step === 1 ? (
        <Page
          key={step}
          icon={
            <Ionicons name="shield-checkmark" size={80} color={colors.accent} />
          }
          title="a little access."
          body="Your phone will ask for a few permissions. Here's why:"
        >
          <Reason
            icon="bluetooth"
            title="Nearby devices"
            text="To find and talk to your helmet over Bluetooth."
          />
          <Reason
            icon="location"
            title="Location"
            text="For navigation, speed, and sending your position in an emergency."
          />
          {permState === "denied" ? (
            <Banner
              tone="warning"
              title="Some permissions were denied"
              message="The helmet and navigation won't work without them."
            />
          ) : null}
          {permState === "blocked" ? (
            <Banner
              tone="danger"
              title="Permission blocked"
              message="Enable them in system settings, then come back."
              action={
                <Button
                  label="Open settings"
                  compact
                  onPress={() => void Linking.openSettings()}
                />
              }
            />
          ) : null}
          <Button
            label={permState === "idle" ? "Allow" : "Try again"}
            icon="key"
            onPress={() => void askPermissions()}
          />
          <Button
            label="Skip for now"
            variant="ghost"
            onPress={() => setStep(2)}
          />
        </Page>
      ) : step === 2 ? (
        <Page
          key={step}
          icon={<Ionicons name="people" size={80} color={colors.accent} />}
          title="someone to call."
          body="If your helmet detects a crash and you don't cancel within 10 seconds, these people are shown so anyone can call them in one tap."
        >
          {contactCount > 0 ? (
            <Banner
              tone="success"
              title={`${contactCount} contact${contactCount === 1 ? "" : "s"} added`}
            />
          ) : null}
          <Button
            label={contactCount ? "Add another" : "Add a contact"}
            icon="person-add"
            variant={contactCount ? "secondary" : "primary"}
            onPress={() => router.push("/contacts")}
          />
          <Button
            label={contactCount ? "Continue" : "Skip for now"}
            variant={contactCount ? "primary" : "ghost"}
            onPress={() => setStep(3)}
          />
        </Page>
      ) : (
        <Page
          key={step}
          icon={<JourneyArtwork kind="helmet" size={180} animated />}
          title="better together."
          body="Switch your helmet on and keep it close to your phone. You can also do this later from the Helmet tab."
        >
          <Button
            label="Pair helmet now"
            icon="bluetooth"
            onPress={() => finish("/helmet")}
          />
          <Button
            label="I'll do it later"
            variant="ghost"
            onPress={() => finish("/")}
          />
        </Page>
      )}
    </SafeAreaView>
  );
}

function Page({
  icon,
  title,
  body,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <ScrollView
      style={{ width: "100%", maxWidth: 600, alignSelf: "center" }}
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      <Entrance style={styles.hero}>
        <View style={styles.iconCircle}>{icon}</View>
        <AppText variant="display" weight="bold" align="center">
          {title}
        </AppText>
        <AppText color={colors.textMuted} align="center">
          {body}
        </AppText>
      </Entrance>
      <Entrance delay={160} style={styles.actions}>
        {children}
      </Entrance>
    </ScrollView>
  );
}

function Reason({
  icon,
  title,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
}) {
  return (
    <View style={styles.reason}>
      <Ionicons name={icon} size={24} color={colors.accent} />
      <View style={styles.flex}>
        <AppText weight="bold">{title}</AppText>
        <AppText variant="small" color={colors.textMuted}>
          {text}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.xl,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  dot: {
    width: 28,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.accent,
  },
  page: {
    flexGrow: 1,
    justifyContent: "space-between",
    gap: 32,
    paddingBottom: 24,
  },
  hero: {
    paddingVertical: 40,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.lg,
  },
  iconCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  actions: {
    gap: spacing.md,
  },
  reason: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  flex: {
    flex: 1,
  },
});
