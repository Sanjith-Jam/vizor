import { useMemo } from "react";
import * as Speech from "expo-speech";
import type { SpeechEngine } from "../protocol/voicePrompts";

/** SpeechEngine backed by expo-speech, stable across re-renders. */
export function useSpeech(): SpeechEngine {
  return useMemo<SpeechEngine>(
    () => ({
      speak: (text: string) => {
        Speech.speak(text);
      },
    }),
    [],
  );
}
