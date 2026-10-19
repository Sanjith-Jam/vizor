import React, { useEffect, useRef, useState } from "react";
import { View, TextInput, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import { File } from "expo-file-system";
import * as Speech from "expo-speech";
import * as Location from "expo-location";
import { AssistantOrb } from "./AssistantOrb";
import { Button, AppText, Card } from "./ui";
import { cloudApi } from "../cloud/client";
import { enqueueObservation, syncObservations } from "../cloud/queue";
import { useRide } from "../hooks/useRide";
import { useHelmetConnection } from "../hooks/useHelmetConnection";
import { useSettings } from "../hooks/useSettings";
import { useCloud } from "../cloud/useCloud";
import {
  validateReply,
  upcomingHazards,
  type AssistantReply,
  type Pothole,
} from "../../../shared/contracts";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors, spacing } from "../theme";
export function VoiceAssistant({
  trigger,
  initialText = "",
}: {
  trigger?: string;
  initialText?: string;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY),
    router = useRouter(),
    ride = useRide(),
    { connection } = useHelmetConnection(),
    { settings, update } = useSettings(),
    { telemetry } = useCloud();
  const [text, setText] = useState(initialText),
    [message, setMessage] = useState(""),
    [listening, setListening] = useState(false),
    [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    controller = useRef<AbortController | null>(null),
    toggleRef = useRef<() => void>(() => {});
  const ask = async (audio?: string) => {
    if (busy || (!audio && !text.trim())) return;
    setBusy(true);
    controller.current = new AbortController();
    try {
      const cached: Pothole[] = JSON.parse(
        (await AsyncStorage.getItem("vizor.road-hazards.v1")) || "[]",
      );
      const answer = validateReply(
        await cloudApi<AssistantReply>(
          "assistant",
          {
            text,
            audio,
            mimeType: "audio/mp4",
            context: {
              destination: ride.destination?.name,
              upcomingHazards:
                ride.route && ride.position
                  ? upcomingHazards(ride.route.geometry, ride.position, cached)
                      .length
                  : null,
              helmet: telemetry,
            },
          },
          controller.current.signal,
        ),
      );
      setMessage(
        `${answer.transcript ? "You: " + answer.transcript + "\n" : ""}${answer.message}`,
      );
      if (settings.voicePrompts) Speech.speak(answer.message);
      if (answer.action === "navigate") {
        router.push({
          pathname: "/navigate",
          params: { query: answer.destination },
        });
      }
      if (answer.action === "cancel") ride.endRide();
      if (answer.action === "mute") update({ voicePrompts: false });
      if (answer.action === "unmute") update({ voicePrompts: true });
      if (answer.action === "repeat") {
        const instruction =
          ride.route?.steps[ride.progress?.nextStepIndex || 1]?.instruction;
        Speech.speak(instruction || "No active navigation.");
      }
      if (answer.action === "report") {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted)
          throw Error("Location permission is needed to report this hazard.");
        const p = await Location.getCurrentPositionAsync();
        await enqueueObservation({
          eventId: `manual-${Date.now()}`,
          source: "manual",
          observedAt: new Date(p.timestamp).toISOString(),
          location: { lat: p.coords.latitude, lon: p.coords.longitude },
          accuracyMeters: p.coords.accuracy,
          confidence: null,
        });
        await syncObservations();
        setMessage("Observation saved. Upload will retry if you are offline.");
      }
      setText("");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const toggle = async () => {
    try {
      if (listening) {
        if (timer.current) clearTimeout(timer.current);
        await recorder.stop();
        setListening(false);
        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
        });
        if (recorder.uri) await ask(await new File(recorder.uri).base64());
        return;
      }
      const p = await requestRecordingPermissionsAsync();
      if (!p.granted)
        throw Error(
          "Microphone permission was denied. Type your request instead.",
        );
      Speech.stop();
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setListening(true);
      timer.current = setTimeout(() => toggleRef.current(), 20000);
    } catch (e) {
      setListening(false);
      setMessage((e as Error).message);
    }
  };
  toggleRef.current = () => void toggle();
  useEffect(() => {
    if (trigger) toggleRef.current();
  }, [trigger]);
  useEffect(
    () => () => {
      controller.current?.abort();
      if (timer.current) clearTimeout(timer.current);
      if (recorder.isRecording) void recorder.stop();
    },
    [],
  );
  return (
    <Card>
      <AppText variant="caption" weight="bold" color={colors.textMuted}>
        YOUR VOICE CO-PILOT
      </AppText>
      <View style={{ alignItems: "center", paddingVertical: 16 }}>
        <AssistantOrb size={90} active={listening || busy} />
        <AppText variant="heading" weight="bold" align="center">
          What’s on your mind?
        </AppText>
      </View>
      <View style={styles.row}>
        <TextInput
          accessibilityLabel="Ask Vizor"
          style={styles.input}
          placeholder="What’s ahead?"
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => void ask()}
        />
      </View>
      <View style={styles.row}>
        <Button
          label={listening ? "Stop" : "Talk"}
          icon={listening ? "stop" : "mic"}
          compact
          disabled={busy}
          onPress={() => void toggle()}
        />
        {text && !busy ? (
          <Button
            label="Clear text"
            compact
            variant="ghost"
            onPress={() => setText("")}
          />
        ) : null}
      </View>
      {text.trim() ? (
        <Button
          label="Send request"
          compact
          disabled={busy}
          onPress={() => void ask()}
        />
      ) : null}
      {listening ? (
        <Button
          label="Discard recording"
          compact
          variant="ghost"
          onPress={() => {
            if (timer.current) clearTimeout(timer.current);
            void recorder.stop().then(() =>
              setAudioModeAsync({
                allowsRecording: false,
                playsInSilentMode: true,
              }),
            );
            setListening(false);
          }}
        />
      ) : null}
      {busy ? (
        <Button
          label="Cancel request"
          compact
          variant="ghost"
          onPress={() => controller.current?.abort()}
        />
      ) : null}
      <AppText variant="small" color={colors.textMuted}>
        {listening
          ? "Listening… tap Stop when finished."
          : busy
            ? "Working…"
            : message ||
              "Ask about your route, report a hazard, or repeat a direction."}
      </AppText>
    </Card>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.sm,
    marginVertical: spacing.md,
    alignItems: "center",
  },
  input: {
    flex: 1,
    minHeight: 56,
    color: colors.text,
    backgroundColor: colors.bg,
    padding: 12,
    borderRadius: 8,
  },
});
