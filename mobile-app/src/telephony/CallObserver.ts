/**
 * Native and integrated incoming-call detection, relay, and answer/decline.
 *
 * Implements real-time call state observation, connects to Android
 * TelephonyManager broadcasts when running natively with READ_PHONE_STATE,
 * and provides simulated/bridged call testing so the rider can verify
 * HUD caller alerts and PTT accept/decline actions.
 */

import { NativeEventEmitter, NativeModules, Platform } from "react-native";

export type CallObserverEvent =
  | { type: "ringing"; callerName: string | null }
  | { type: "ended" };

export interface CallObserver {
  /** Start listening for call state changes. */
  start(onEvent: (event: CallObserverEvent) => void): void;
  /** Stop listening. */
  stop(): void;
  /** Answer the current ringing call, if any. */
  answerCall(): void;
  /** Decline/reject the current ringing call, if any. */
  declineCall(): void;
}

type CallEventListener = (event: CallObserverEvent) => void;

class IntegratedCallObserver implements CallObserver {
  private listeners = new Set<CallEventListener>();
  private activeState: "idle" | "ringing" = "idle";
  private currentCaller: string | null = null;
  private nativeSubscription: { remove: () => void } | null = null;

  constructor() {
    this.setupNativeTelephony();
  }

  private setupNativeTelephony(): void {
    if (Platform.OS === "android") {
      try {
        const telephonyModule =
          NativeModules.TelephonyModule || NativeModules.PhoneCallModule;
        if (telephonyModule) {
          const emitter = new NativeEventEmitter(telephonyModule);
          this.nativeSubscription = emitter.addListener(
            "onCallStateChanged",
            (data: { state: string; number?: string; name?: string }) => {
              if (data.state === "RINGING") {
                this.dispatchRinging(
                  data.name ?? data.number ?? "Incoming Call",
                );
              } else if (data.state === "IDLE" || data.state === "OFFHOOK") {
                this.dispatchEnded();
              }
            },
          );
        }
      } catch (e) {
        // Fallback gracefully if native telephony module is not injected
      }
    }
  }

  start(onEvent: CallEventListener): void {
    this.listeners.add(onEvent);
    if (this.activeState === "ringing") {
      onEvent({ type: "ringing", callerName: this.currentCaller });
    }
  }

  stop(): void {
    this.listeners.clear();
    if (this.nativeSubscription) {
      this.nativeSubscription.remove();
      this.nativeSubscription = null;
    }
  }

  answerCall(): void {
    const module =
      NativeModules.TelephonyModule || NativeModules.PhoneCallModule;
    if (!module?.answerCall) {
      console.warn("Native call answering is unavailable in this build.");
      return;
    }
    module.answerCall();
  }

  declineCall(): void {
    const module =
      NativeModules.TelephonyModule || NativeModules.PhoneCallModule;
    if (!module?.endCall) {
      console.warn("Native call rejection is unavailable in this build.");
      return;
    }
    module.endCall();
  }

  dispatchRinging(callerName: string | null): void {
    this.activeState = "ringing";
    this.currentCaller = callerName;
    this.notify({ type: "ringing", callerName });
  }

  dispatchEnded(): void {
    if (this.activeState === "idle") return;
    this.activeState = "idle";
    this.currentCaller = null;
    this.notify({ type: "ended" });
  }

  private notify(event: CallObserverEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[CallObserver] Listener error:", err);
      }
    }
  }
}

// Global singleton instance so simulation in dev tools triggers the active app listener
let sharedCallObserver: IntegratedCallObserver | null = null;

export function getSharedCallObserver(): IntegratedCallObserver {
  if (!sharedCallObserver) {
    sharedCallObserver = new IntegratedCallObserver();
  }
  return sharedCallObserver;
}

export function createCallObserver(): CallObserver {
  return getSharedCallObserver();
}

/** Triggers a simulated incoming call to verify HUD packets and speech. */
export function simulateIncomingCall(callerName: string = "Mom"): void {
  getSharedCallObserver().dispatchRinging(callerName);
}

/** Ends any active incoming call. */
export function simulateEndCall(): void {
  getSharedCallObserver().dispatchEnded();
}
