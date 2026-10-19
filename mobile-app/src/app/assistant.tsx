import React, { useEffect } from "react";
import { useLocalSearchParams } from "expo-router";
import { Screen } from "../components/ui";
import { VoiceAssistant } from "../components/VoiceAssistant";
export default function Assistant() {
  const { listen, query } = useLocalSearchParams<{
    listen?: string;
    query?: string;
  }>();
  return (
    <Screen>
      <VoiceAssistant trigger={listen} initialText={query} />
    </Screen>
  );
}
