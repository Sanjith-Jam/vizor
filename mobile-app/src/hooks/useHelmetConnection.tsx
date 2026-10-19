import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { getHelmetConnection } from "../ble/connectionInstance";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import {
  HelmetConnection,
  type ConnectionError,
  type ConnectionStatus,
  type PacketLogEntry,
} from "../ble/HelmetConnection";
import type { HazardEvent } from "../protocol/hazardProtocol";
import { useSettings } from "./useSettings";

interface HelmetConnectionContextValue {
  connection: HelmetConnection;
  status: ConnectionStatus;
  lastError: ConnectionError | null;
  lastHazardEvent: HazardEvent | null;
  /** Most recent BLE packets both ways, newest first (developer tools). */
  packetLog: PacketLogEntry[];
}

const HelmetConnectionContext =
  createContext<HelmetConnectionContextValue | null>(null);
const PACKET_LOG_SIZE = 50;

/** One HelmetConnection (one BLE link) per app run; mount this once at the root, inside SettingsProvider. */
export function HelmetConnectionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const connectionRef = useRef<HelmetConnection | null>(null);
  if (!connectionRef.current) {
    connectionRef.current = getHelmetConnection();
  }
  const connection = connectionRef.current;
  const { settings, loaded, update } = useSettings();

  const [status, setStatus] = useState<ConnectionStatus>(connection.status);
  const [lastError, setLastError] = useState<ConnectionError | null>(null);
  const [lastHazardEvent, setLastHazardEvent] = useState<HazardEvent | null>(
    null,
  );
  const [packetLog, setPacketLog] = useState<PacketLogEntry[]>([]);

  const voiceRef = useRef(settings.voicePrompts);
  voiceRef.current = settings.voicePrompts;
  const prevStatus = useRef<ConnectionStatus>(connection.status);

  useEffect(() => {
    const unsubscribeStatus = connection.onStatusChange.on((next) => {
      const prev = prevStatus.current;
      prevStatus.current = next;
      setStatus(next);
      if (next === "connected" && prev !== "connected") {
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => undefined);
        if (voiceRef.current) Speech.speak("Helmet connected.");
      } else if (next === "reconnecting" && prev === "connected") {
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Warning,
        ).catch(() => undefined);
        if (voiceRef.current)
          Speech.speak("Helmet connection lost. Reconnecting.");
      }
    });
    const unsubscribeError = connection.onError.on(setLastError);
    const unsubscribeHazard = connection.onHazardEvent.on(setLastHazardEvent);
    const unsubscribePacket = connection.onPacket.on((entry) =>
      setPacketLog((prev) => [entry, ...prev].slice(0, PACKET_LOG_SIZE)),
    );
    return () => {
      unsubscribeStatus();
      unsubscribeError();
      unsubscribeHazard();
      unsubscribePacket();
      void connection.destroy();
    };
    // connection is a ref-held singleton for this provider's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Remember the helmet so the next launch reconnects without a scan.
  useEffect(
    () => connection.onConnected.on((id) => update({ lastDeviceId: id })),
    [connection, update],
  );

  // Auto-reconnect to the remembered helmet once settings have loaded -
  // only after onboarding, so first launch never fires a permission prompt cold.
  const triedAutoConnect = useRef(false);
  useEffect(() => {
    if (!loaded || triedAutoConnect.current) {
      return;
    }
    triedAutoConnect.current = true;
    if (
      settings.onboardingDone &&
      settings.autoReconnect &&
      settings.lastDeviceId
    ) {
      void connection.reconnectTo(settings.lastDeviceId);
    }
  }, [
    loaded,
    settings.onboardingDone,
    settings.autoReconnect,
    settings.lastDeviceId,
    connection,
  ]);

  return (
    <HelmetConnectionContext.Provider
      value={{ connection, status, lastError, lastHazardEvent, packetLog }}
    >
      {children}
    </HelmetConnectionContext.Provider>
  );
}

export function useHelmetConnection(): HelmetConnectionContextValue {
  const value = useContext(HelmetConnectionContext);
  if (!value) {
    throw new Error(
      "useHelmetConnection must be used within a HelmetConnectionProvider",
    );
  }
  return value;
}
