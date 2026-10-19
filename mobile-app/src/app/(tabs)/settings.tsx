import React, { useCallback, useState } from "react";
import { Linking, Pressable, StyleSheet, Switch, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import * as Speech from "expo-speech";
import {
  AppText,
  Banner,
  Card,
  ListRow,
  Screen,
  SectionTitle,
  Entrance,
} from "../../components/ui";
import { useCloud } from "../../cloud/useCloud";
import { useSettings } from "../../hooks/useSettings";
import { loadContacts } from "../../sos/contactsStore";
import {
  checkForUpdate,
  currentAppVersion,
  presentUpdate,
} from "../../update/UpdateGate";
import { JourneyArtwork } from "../../components/JourneyArtwork";
import { colors, radius, spacing } from "../../theme";

const REPO_URL =
  "https://github.com/Kettydee/AI-Assisted-AR-Helmet-Navigation-System";

export default function SettingsScreen() {
  const router = useRouter();
  const { session, pending } = useCloud();
  const { settings, update } = useSettings();
  const [contactCount, setContactCount] = useState(0);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadContacts()
        .then((c) => setContactCount(c.length))
        .catch(() => undefined);
    }, []),
  );

  const runUpdateCheck = async () => {
    setUpdateStatus("Checking…");
    const found = await checkForUpdate();
    if (found) {
      setUpdateStatus(null);
      presentUpdate(found);
    } else {
      setUpdateStatus("You're on the latest version (or you're offline).");
    }
  };

  return (
    <Screen edges={["top"]}>
      <Entrance>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1, gap: 8 }}>
            <AppText variant="display" weight="bold">
              your space.
            </AppText>
            <AppText color={colors.textMuted}>
              Small details. Better rides.
            </AppText>
          </View>
          <JourneyArtwork size={100} />
        </View>
      </Entrance>

      <Card
        style={{ backgroundColor: colors.accentDim }}
        onPress={() => router.push("/account")}
        accessibilityLabel="Manage your cloud account"
      >
        <AppText variant="caption" color={colors.textMuted}>
          VIZOR ACCOUNT
        </AppText>
        <AppText variant="heading" weight="bold">
          {session ? "Your roads, connected." : "Keep your rides together."}
        </AppText>
        <AppText variant="small" color={colors.textMuted}>
          {session
            ? `${pending} observations waiting to sync`
            : "Sign in for shared reports and private ride sync."}
        </AppText>
        <AppText weight="semibold">
          {session ? "Manage account →" : "Connect your account →"}
        </AppText>
      </Card>
      <ListRow
        icon="time-outline"
        title="Ride history"
        subtitle="Your completed journeys"
        onPress={() => router.push("/history")}
      />
      <SectionTitle>Safety</SectionTitle>
      <ListRow
        icon="people"
        iconColor={contactCount ? colors.accent : colors.warning}
        title="Emergency contacts"
        subtitle={
          contactCount ? `${contactCount} saved` : "None saved - add one now"
        }
        onPress={() => router.push("/contacts")}
      />

      <SectionTitle>Riding</SectionTitle>
      <Card>
        <AppText weight="semibold">Units</AppText>
        <Segmented
          options={[
            { key: "metric", label: "Kilometres" },
            { key: "imperial", label: "Miles" },
          ]}
          value={settings.units}
          onChange={(units) => update({ units })}
        />
      </Card>

      <ListRow
        icon="volume-high"
        title="Voice prompts"
        subtitle="Spoken turns, hazards and alerts"
        showChevron={false}
        right={
          <Switch
            accessibilityLabel="Voice prompts"
            value={settings.voicePrompts}
            onValueChange={(voicePrompts) => {
              update({ voicePrompts });
              if (voicePrompts) Speech.speak("Voice prompts on.");
            }}
            trackColor={{ true: colors.accent, false: colors.border }}
            thumbColor="#ffffff"
          />
        }
      />

      <SectionTitle>Helmet</SectionTitle>
      <ListRow
        icon="refresh"
        title="Auto-reconnect"
        subtitle="Reconnect to your last helmet at launch"
        showChevron={false}
        right={
          <Switch
            accessibilityLabel="Auto-reconnect"
            value={settings.autoReconnect}
            onValueChange={(autoReconnect) => update({ autoReconnect })}
            trackColor={{ true: colors.accent, false: colors.border }}
            thumbColor="#ffffff"
          />
        }
      />
      <ListRow
        icon="code-slash"
        title="Developer tools"
        subtitle="Test arrows and raw BLE packets"
        onPress={() => router.push("/developer")}
      />
      <ListRow
        icon="call"
        iconColor={colors.textFaint}
        title="Incoming call alerts"
        subtitle="Coming soon - needs native phone integration"
        showChevron={false}
      />

      <SectionTitle>About</SectionTitle>
      <ListRow
        icon="cloud-download"
        title="Check for updates"
        subtitle={`Installed version ${currentAppVersion()}`}
        onPress={() => void runUpdateCheck()}
      />
      {updateStatus ? <Banner tone="info" title={updateStatus} /> : null}
      <ListRow
        icon="logo-github"
        title="Project on GitHub"
        onPress={() => void Linking.openURL(REPO_URL)}
      />
      <ListRow
        icon="play-circle"
        title="Replay setup guide"
        onPress={() => router.push("/onboarding")}
      />
    </Screen>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => (
        <Pressable
          key={o.key}
          accessibilityRole="button"
          accessibilityState={{ selected: value === o.key }}
          onPress={() => onChange(o.key)}
          style={[styles.segment, value === o.key && styles.chipActive]}
        >
          <AppText
            weight="semibold"
            color={value === o.key ? colors.onAccent : colors.text}
          >
            {o.label}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: spacing.sm,
  },
  segmented: {
    flexDirection: "row",
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
});
