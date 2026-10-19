import React, { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Modal, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Application from "expo-application";
import Constants from "expo-constants";
import { AppText, Button } from "../components/ui";
import { colors, spacing } from "../theme";
import { findUpdate, type AvailableUpdate } from "./updateCheck";

const DEFAULT_REPO = "Sanjith-Jam/vizor";

export function currentAppVersion(): string {
  return Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "0.0.0";
}

function releasesUrl(): string {
  const repo = (Constants.expoConfig?.extra as { updateRepo?: string } | undefined)?.updateRepo ?? DEFAULT_REPO;
  return `https://api.github.com/repos/${repo}/releases?per_page=20`;
}

/** Fetches GitHub Releases; resolves null when offline/rate-limited so the app never locks out a rider without internet. */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  try {
    const res = await fetch(releasesUrl(), { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) {
      return null;
    }
    return findUpdate(await res.json(), currentAppVersion());
  } catch {
    return null;
  }
}

let showGate: ((update: AvailableUpdate) => void) | null = null;

/** Lets a manual "Check for updates" open the gate immediately. */
export function presentUpdate(update: AvailableUpdate): void {
  showGate?.(update);
}

/**
 * Mandatory update screen. Checks on launch and whenever the app returns to
 * the foreground; if a newer `app-v*` release exists, covers the whole app
 * until it's installed. Rendered *below* CrashOverlay in _layout.tsx, so a
 * crash alert still shows on top of it.
 */
export function UpdateGate() {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);

  const run = useCallback(() => {
    void checkForUpdate().then(setUpdate);
  }, []);

  useEffect(() => {
    showGate = setUpdate;
    run();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        run();
      }
    });
    return () => {
      showGate = null;
      sub.remove();
    };
  }, [run]);

  if (!update) {
    return null;
  }

  return (
    <Modal visible animationType="fade" onRequestClose={() => undefined} statusBarTranslucent>
      <SafeAreaView style={styles.container}>
        <View style={styles.iconWrap}>
          <Ionicons name="cloud-download" size={56} color={colors.accent} />
        </View>
        <AppText variant="title" weight="extrabold" align="center">
          Update required
        </AppText>
        <AppText color={colors.textMuted} align="center">
          Version {update.version} of AR Helmet Nav is available. You have {currentAppVersion()}. Install the update to
          keep using the app.
        </AppText>
        {update.notes ? (
          <View style={styles.notes}>
            <AppText variant="small" weight="bold" color={colors.textMuted}>
              WHAT'S NEW
            </AppText>
            <AppText variant="small" numberOfLines={10}>
              {update.notes}
            </AppText>
          </View>
        ) : null}
        <View style={styles.actions}>
          <Button
            label="Download update"
            icon="download"
            onPress={() => void Linking.openURL(update.downloadUrl)}
            accessibilityHint="Downloads the new APK. Open it when it finishes to install."
          />
          <AppText variant="caption" color={colors.textFaint} align="center">
            When the download finishes, open the file and tap Install. If Android asks, allow installs from your browser.
            Your contacts and settings are kept.
          </AppText>
          <Button label="I've installed it - check again" variant="ghost" onPress={run} compact />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.xl,
    justifyContent: "center",
    gap: spacing.lg,
  },
  iconWrap: {
    alignSelf: "center",
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.accentDim,
    alignItems: "center",
    justifyContent: "center",
  },
  notes: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.xs,
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
});
