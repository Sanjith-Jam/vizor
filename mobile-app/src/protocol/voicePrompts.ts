import {NavigationDirection} from "./navigationProtocol";

export type AvoidanceDirection = "LEFT" | "CENTER" | "RIGHT";

/** Minimal interface that can be backed by Expo Speech, react-native-tts, etc. */
export interface SpeechEngine {
  speak(text: string): void | Promise<void>;
}

export function navigationVoicePrompt(
  direction: NavigationDirection,
  distanceMeters: number,
): string {
  const distance = Math.max(0, Math.round(distanceMeters));

  switch (direction) {
    case NavigationDirection.LEFT:
      return `Turn left in ${distance} meters.`;
    case NavigationDirection.RIGHT:
      return `Turn right in ${distance} meters.`;
    case NavigationDirection.STRAIGHT:
      return `Continue straight for ${distance} meters.`;
    case NavigationDirection.U_TURN:
      return `Make a U-turn in ${distance} meters.`;
    case NavigationDirection.DESTINATION:
      return "You have reached your destination.";
  }
}

export function potholeVoicePrompt(direction: AvoidanceDirection): string {
  switch (direction) {
    case "LEFT":
      return "Pothole detected. Go left.";
    case "RIGHT":
      return "Pothole detected. Go right.";
    case "CENTER":
      return "Pothole detected. Keep center.";
  }
}

export function announceNavigation(
  speech: SpeechEngine,
  direction: NavigationDirection,
  distanceMeters: number,
): void | Promise<void> {
  return speech.speak(navigationVoicePrompt(direction, distanceMeters));
}

export function announcePothole(
  speech: SpeechEngine,
  direction: AvoidanceDirection,
): void | Promise<void> {
  return speech.speak(potholeVoicePrompt(direction));
}

export function incomingCallVoicePrompt(callerName: string): string {
  const name = callerName.trim();
  return name
    ? `Incoming call from ${name}. Tap the helmet button to accept, or hold it to decline.`
    : "Incoming call. Tap the helmet button to accept, or hold it to decline.";
}

export function announceIncomingCall(
  speech: SpeechEngine,
  callerName: string,
): void | Promise<void> {
  return speech.speak(incomingCallVoicePrompt(callerName));
}

export function crashVoicePrompt(cancelWindowSeconds: number): string {
  const seconds = Math.max(0, Math.round(cancelWindowSeconds));
  return (
    `Crash detected. Sending an SOS with your location in ${seconds} seconds. ` +
    "Press the helmet button now to cancel."
  );
}

/** Trigger when a CRASH_DETECTED hazard event arrives; this is the "audible
 *  alert to rider" the crash/SOS flow calls for (see docs/ARCHITECTURE.md). */
export function announceCrash(
  speech: SpeechEngine,
  cancelWindowSeconds: number = 10,
): void | Promise<void> {
  return speech.speak(crashVoicePrompt(cancelWindowSeconds));
}
