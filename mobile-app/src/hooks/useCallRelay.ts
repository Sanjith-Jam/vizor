import { useEffect, useRef } from "react";
import { useHelmetConnection } from "./useHelmetConnection";
import { createCallObserver } from "../telephony/CallObserver";
import { CallAction, CallEventType } from "../protocol/callAlertProtocol";
import { announceIncomingCall } from "../protocol/voicePrompts";
import { useSpeech } from "./useSpeech";

/**
 * Wires native call state to the helmet's call characteristics in both
 * directions: a ringing/ended call becomes a RINGING/ENDED write, and the
 * helmet's ACCEPT/DECLINE notify (from the rider's PTT button) becomes a
 * native answer/decline. Mount once, inside HelmetConnectionProvider.
 *
 * The native half is a stub for now - see CallObserver.ts.
 */
export function useCallRelay(): void {
  const { connection, status } = useHelmetConnection();
  const speech = useSpeech();
  const observerRef = useRef(createCallObserver());

  useEffect(() => {
    const observer = observerRef.current;
    observer.start((event) => {
      if (event.type === "ringing") {
        void connection.sendCallAlert(CallEventType.RINGING, event.callerName ?? undefined);
        void announceIncomingCall(speech, event.callerName ?? "");
      } else {
        void connection.sendCallAlert(CallEventType.ENDED);
      }
    });
    return () => observer.stop();
  }, [connection, speech]);

  useEffect(() => {
    if (status !== "connected") {
      return;
    }
    return connection.onCallAction.on((action) => {
      const observer = observerRef.current;
      if (action === CallAction.ACCEPT) {
        observer.answerCall();
      } else if (action === CallAction.DECLINE) {
        observer.declineCall();
      }
    });
  }, [connection, status]);
}
