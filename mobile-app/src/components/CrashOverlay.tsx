import React, { useEffect, useRef, useState } from "react";
import {
  Platform,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Vibration,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useCrashAlert } from "../hooks/useCrashAlert";
import {
  crashLocationMessage,
  callContact,
  textContact,
} from "../sos/dispatchSos";
import { loadContacts } from "../sos/contactsStore";
import type { SosContact } from "../sos/contactValidation";
import { AppText, useReducedMotionPreference } from "./ui";
import { fonts, radius, spacing } from "../theme";

const RED = "#B91C1C";
const RED_DEEP = "#7F1010";

/** Always-mounted (not a routed screen) so a crash alert can interrupt
 *  whatever screen the rider is on, and can't be navigated away from
 *  during the countdown the way a pushed route could be. */
export function CrashOverlay() {
  const reduced = useReducedMotionPreference();
  const { phase, secondsRemaining, event, dismiss } = useCrashAlert();
  const [contacts, setContacts] = useState<SosContact[]>([]);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (phase === "idle") {
      Vibration.cancel();
      return;
    }
    loadContacts()
      .then(setContacts)
      .catch(() => setContacts([]));
    if (phase === "counting") {
      Vibration.vibrate([0, 600, 400], true);
      if (reduced) {
        pulse.setValue(1);
        return () => Vibration.cancel();
      }
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1.08,
            duration: 450,
            easing: Easing.out(Easing.quad),
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(pulse, {
            toValue: 1,
            duration: 450,
            easing: Easing.in(Easing.quad),
            useNativeDriver: Platform.OS !== "web",
          }),
        ]),
      );
      loop.start();
      return () => {
        loop.stop();
        Vibration.cancel();
      };
    }
    Vibration.cancel();
  }, [phase, pulse, reduced]);

  if (phase === "idle") {
    return null;
  }

  const message = event
    ? crashLocationMessage(event)
    : "Possible crash detected by my AR helmet.";

  return (
    <Modal
      visible
      transparent={false}
      animationType={reduced ? "none" : "fade"}
      statusBarTranslucent
      onRequestClose={() => undefined}
    >
      <SafeAreaView
        style={[
          styles.container,
          phase === "dispatch" && styles.containerDispatch,
        ]}
      >
        {phase === "counting" ? (
          <View style={styles.center}>
            <Ionicons name="warning" size={56} color="#ffffff" />
            <AppText
              color="#FFFFFF"
              variant="title"
              weight="extrabold"
              align="center"
              style={styles.tracking}
            >
              CRASH DETECTED
            </AppText>
            <Animated.View
              style={[styles.ring, { transform: [{ scale: pulse }] }]}
            >
              <AppText color="#FFFFFF" style={styles.countdown} align="center">
                {secondsRemaining}
              </AppText>
            </Animated.View>
            <AppText
              color="#FFFFFF"
              variant="heading"
              weight="semibold"
              align="center"
            >
              Press the helmet button now to cancel
            </AppText>
            <AppText variant="small" color="#FFD7D7" align="center">
              If you don't, your emergency contacts will be shown here to call.
            </AppText>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.dispatch}>
            <View style={styles.sosHeader}>
              <Ionicons name="medkit" size={36} color="#ffffff" />
              <AppText
                color="#FFFFFF"
                variant="display"
                weight="extrabold"
                style={styles.tracking}
              >
                SOS
              </AppText>
            </View>
            <AppText variant="small" color="#FFE5E5">
              {message}
            </AppText>

            {contacts.length === 0 ? (
              <View style={styles.contactCard}>
                <AppText color="#FFFFFF" weight="semibold">
                  No emergency contacts saved.
                </AppText>
                <AppText variant="small" color="#FFE5E5">
                  Call your local emergency number. Add contacts later from
                  Settings.
                </AppText>
              </View>
            ) : (
              contacts.map((contact) => (
                <View key={contact.id} style={styles.contactCard}>
                  <View style={styles.contactInfo}>
                    <AppText color="#FFFFFF" variant="heading" weight="bold">
                      {contact.name}
                    </AppText>
                    <AppText variant="small" color="#FFE5E5">
                      {contact.phone}
                    </AppText>
                  </View>
                  <View style={styles.actions}>
                    <BigAction
                      icon="call"
                      label="Call"
                      onPress={() => void callContact(contact)}
                    />
                    <BigAction
                      icon="chatbubble"
                      label="Text location"
                      onPress={() => void textContact(contact, message)}
                    />
                  </View>
                </View>
              ))
            )}

            <Pressable
              accessibilityRole="button"
              style={styles.dismiss}
              onPress={dismiss}
            >
              <AppText color="#FFFFFF" weight="semibold">
                I'm safe - dismiss
              </AppText>
            </Pressable>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function BigAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.bigAction, pressed && { opacity: 0.8 }]}
    >
      <Ionicons name={icon} size={22} color={RED_DEEP} />
      <AppText weight="bold" color={RED_DEEP}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: RED,
  },
  containerDispatch: {
    backgroundColor: RED_DEEP,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.lg,
  },
  tracking: {
    letterSpacing: 2,
  },
  ring: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 6,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: spacing.lg,
  },
  countdown: {
    color: "#ffffff",
    fontFamily: fonts.extrabold,
    fontSize: 104,
    lineHeight: 120,
  },
  dispatch: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  sosHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  contactCard: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  contactInfo: {
    gap: 2,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  bigAction: {
    flex: 1,
    minHeight: 56,
    backgroundColor: "#ffffff",
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  dismiss: {
    marginTop: spacing.lg,
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#FFE5E5",
    alignItems: "center",
    justifyContent: "center",
  },
});
