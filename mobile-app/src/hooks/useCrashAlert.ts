import { useCallback, useEffect, useRef, useState } from "react";
import { useHelmetConnection } from "./useHelmetConnection";
import { useSpeech } from "./useSpeech";
import { HazardEventType, type HazardEvent } from "../protocol/hazardProtocol";
import { announceCrash } from "../protocol/voicePrompts";

// Mirrors firmware/include/config.h's SOS_COUNTDOWN_MS. This is a local
// countdown for the UI; the helmet's own timer is the real deadline for
// whether a PTT press still counts as a cancel.
const SOS_COUNTDOWN_SECONDS = 10;

export type CrashAlertPhase = "idle" | "counting" | "dispatch";

export interface CrashAlertState {
  phase: CrashAlertPhase;
  secondsRemaining: number;
  event: HazardEvent | null;
  /**
   * Only valid in the "dispatch" phase. The firmware stops listening for a
   * PTT cancel once its own countdown elapses (see main.cpp's loop(): once
   * crashConfirmed flips to sosSentPending, a later PTT press no longer
   * sends SOS_CANCELLED), so unlike the "counting" phase - which can only
   * be cancelled by that physical button, matching the real design - this
   * is a plain local dismiss once the person is done calling for help.
   */
  dismiss: () => void;
}

/**
 * Tracks the crash/SOS lifecycle from the helmet's Hazard events:
 * CRASH_DETECTED -> counting down -> either SOS_CANCELLED (PTT pressed in
 * time) back to idle, or the countdown elapsing into "dispatch" (show
 * emergency contacts; the rider or a bystander calls for help).
 */
export function useCrashAlert(): CrashAlertState {
  const { lastHazardEvent } = useHelmetConnection();
  const speech = useSpeech();
  const [phase, setPhase] = useState<CrashAlertPhase>("idle");
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [event, setEvent] = useState<HazardEvent | null>(null);

  useEffect(() => {
    if (!lastHazardEvent) {
      return;
    }
    if (lastHazardEvent.type === HazardEventType.CRASH_DETECTED) {
      setPhase("counting");
      setSecondsRemaining(SOS_COUNTDOWN_SECONDS);
      setEvent(lastHazardEvent);
      void announceCrash(speech, SOS_COUNTDOWN_SECONDS);
    } else if (lastHazardEvent.type === HazardEventType.SOS_CANCELLED) {
      setPhase("idle");
      setSecondsRemaining(0);
    }
  }, [lastHazardEvent, speech]);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    if (phase !== "counting") {
      return;
    }
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        const next = prev - 1;
        if (next <= 0 && phaseRef.current === "counting") {
          setPhase("dispatch");
          return 0;
        }
        return Math.max(0, next);
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  const dismiss = useCallback(() => {
    setPhase("idle");
    setEvent(null);
  }, []);

  return { phase, secondsRemaining, event, dismiss };
}
