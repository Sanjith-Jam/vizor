import {
  BleManager,
  type Device,
  type Subscription,
  type State as BleState,
} from "react-native-ble-plx";
import { bytesToBase64, base64ToBytes } from "./base64";
import {
  SERVICE_UUID,
  NAV_CHAR_UUID,
  HAZARD_CHAR_UUID,
  CALL_CHAR_UUID,
  CALL_ACTION_CHAR_UUID,
  PTT_CHAR_UUID,
} from "./uuids";
import { requestBlePermissions, type PermissionResult } from "./permissions";
import {
  friendlyBleError,
  reconnectDelayMs,
  type BleErrorKind,
} from "./bleErrors";
import type { NavigationDirection } from "../protocol/navigationProtocol";
import { encodeNavigationPacket } from "../protocol/navigationProtocol";
import type { CallEventType, CallAction } from "../protocol/callAlertProtocol";
import {
  encodeCallAlertPacket,
  decodeCallAction,
} from "../protocol/callAlertProtocol";
import type { HazardEvent } from "../protocol/hazardProtocol";
import { decodeHazardEvent } from "../protocol/hazardProtocol";

export type ConnectionStatus =
  | "disconnected"
  | "scanning"
  | "connecting"
  | "connected"
  | "reconnecting";

export interface ScannedHelmet {
  id: string;
  name: string | null;
  rssi: number | null;
}

export interface ConnectionError {
  kind: BleErrorKind;
  message: string;
}

export interface PacketLogEntry {
  at: number;
  direction: "tx" | "rx";
  channel: "nav" | "call" | "hazard" | "call-action";
  hex: string;
}

export type ScanOutcome = PermissionResult | "started";

type Listener<T> = (value: T) => void;

/** Minimal pub-sub, kept dependency-free rather than pulling in an event-emitter package. */
class TinyEmitter<T> {
  private listeners: Listener<T>[] = [];

  on(listener: Listener<T>): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  emit(value: T): void {
    for (const listener of this.listeners) {
      listener(value);
    }
  }
}

const DEFAULT_SCAN_TIMEOUT_MS = 15_000;
const CONNECT_TIMEOUT_MS = 10_000;
const MAX_RECONNECT_ATTEMPTS = 8;
/** Enough for any packet this protocol sends; falls back silently if refused. */
const PREFERRED_MTU = 185;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");
}

/**
 * Owns the single BLE connection to the helmet's ESP32-S3
 * ("AR-Helmet-Nav" in firmware/src/main.cpp's BLEDevice::init call).
 * See useHelmetConnection.tsx for the app-facing React hook/provider around
 * this class - nothing in here is React-specific.
 *
 * Not unit-tested: react-native-ble-plx needs a real BLE stack (and a real
 * helmet to talk to) to meaningfully exercise. The pure logic it calls into
 * (base64, packet encode/decode, error mapping) is tested in isolation.
 */
export class HelmetConnection {
  private manager = new BleManager();
  private device: Device | null = null;
  private subscriptions: Subscription[] = [];
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  /** Set by an explicit disconnect() so the drop isn't treated as a lost link. */
  private userDisconnected = false;

  status: ConnectionStatus = "disconnected";
  lastError: ConnectionError | null = null;
  connectedDeviceId: string | null = null;

  readonly onStatusChange = new TinyEmitter<ConnectionStatus>();
  readonly onPushToTalk = new TinyEmitter<void>();
  readonly onHazardEvent = new TinyEmitter<HazardEvent>();
  readonly onCallAction = new TinyEmitter<CallAction>();
  readonly onError = new TinyEmitter<ConnectionError | null>();
  readonly onConnected = new TinyEmitter<string>();
  readonly onPacket = new TinyEmitter<PacketLogEntry>();

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) {
      return;
    }
    this.status = status;
    this.onStatusChange.emit(status);
  }

  private reportError(raw: string, action: "scan" | "connect" | "write"): void {
    console.warn(`[HelmetConnection] ${action}: ${raw}`);
    this.lastError = friendlyBleError(raw, action);
    this.onError.emit(this.lastError);
  }

  clearError(): void {
    if (this.lastError) {
      this.lastError = null;
      this.onError.emit(null);
    }
  }

  bluetoothState(): Promise<BleState> {
    return this.manager.state();
  }

  onBluetoothStateChange(listener: (state: BleState) => void): () => void {
    const subscription = this.manager.onStateChange(listener, true);
    return () => subscription.remove();
  }

  /** Android only: asks the system to switch Bluetooth on. */
  async enableBluetooth(): Promise<void> {
    await this.manager
      .enable()
      .catch((error: Error) => this.reportError(error.message, "scan"));
  }

  /**
   * Requests runtime permissions, then scans for helmets (filtered to
   * devices advertising SERVICE_UUID) until stopScan() or the timeout.
   */
  async scan(
    onDeviceFound: (device: ScannedHelmet) => void,
    options: { timeoutMs?: number; onFinished?: () => void } = {},
  ): Promise<ScanOutcome> {
    this.cancelReconnect();
    const permission = await requestBlePermissions();
    if (permission !== "granted") {
      this.reportError("Device is not authorized to use BluetoothLE", "scan");
      return permission;
    }
    this.clearError();

    this.manager.stopDeviceScan();
    this.setStatus("scanning");
    this.manager.startDeviceScan([SERVICE_UUID], null, (error, device) => {
      if (error) {
        this.reportError(error.message, "scan");
        this.stopScan();
        options.onFinished?.();
        return;
      }
      if (device) {
        onDeviceFound({ id: device.id, name: device.name, rssi: device.rssi });
      }
    });

    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
    }
    this.scanTimer = setTimeout(() => {
      this.stopScan();
      options.onFinished?.();
    }, options.timeoutMs ?? DEFAULT_SCAN_TIMEOUT_MS);
    return "started";
  }

  stopScan(): void {
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
    this.manager.stopDeviceScan();
    if (this.status === "scanning") {
      this.setStatus("disconnected");
    }
  }

  async connect(deviceId: string): Promise<void> {
    this.stopScan();
    this.cancelReconnect();
    this.userDisconnected = false;
    this.setStatus("connecting");
    try {
      const permission = await requestBlePermissions();
      if (permission !== "granted") {
        throw new Error("Device is not authorized to use BluetoothLE");
      }
      await this.attach(deviceId);
    } catch (error) {
      this.reportError((error as Error).message, "connect");
      this.setStatus("disconnected");
      throw error;
    }
  }

  private async attach(deviceId: string): Promise<void> {
    const connected = await this.manager.connectToDevice(deviceId, {
      timeout: CONNECT_TIMEOUT_MS,
    });
    let device = await connected.discoverAllServicesAndCharacteristics();
    try {
      device = await device.requestMTU(PREFERRED_MTU);
    } catch {
      // Older stacks refuse; every packet still fits in the default 20 bytes.
    }
    this.device = device;
    this.connectedDeviceId = device.id;
    this.clearSubscriptions();

    this.subscriptions.push(
      device.onDisconnected(() => {
        this.device = null;
        this.clearSubscriptions();
        if (this.userDisconnected) {
          this.connectedDeviceId = null;
          this.setStatus("disconnected");
        } else {
          this.scheduleReconnect(deviceId);
        }
      }),
    );

    this.subscriptions.push(
      device.monitorCharacteristicForService(
        SERVICE_UUID,
        HAZARD_CHAR_UUID,
        (error, characteristic) => {
          if (error) {
            // Monitor errors also fire on every normal disconnect; onDisconnected handles that.
            return;
          }
          if (!characteristic?.value) {
            return;
          }
          const bytes = base64ToBytes(characteristic.value);
          this.onPacket.emit({
            at: Date.now(),
            direction: "rx",
            channel: "hazard",
            hex: toHex(bytes),
          });
          const event = decodeHazardEvent(bytes);
          if (event) {
            this.onHazardEvent.emit(event);
          }
        },
      ),
    );

    this.subscriptions.push(
      device.monitorCharacteristicForService(
        SERVICE_UUID,
        CALL_ACTION_CHAR_UUID,
        (error, characteristic) => {
          if (error || !characteristic?.value) {
            return;
          }
          const bytes = base64ToBytes(characteristic.value);
          this.onPacket.emit({
            at: Date.now(),
            direction: "rx",
            channel: "call-action",
            hex: toHex(bytes),
          });
          const action = decodeCallAction(bytes);
          if (action !== null) {
            this.onCallAction.emit(action);
          }
        },
      ),
    );

    const characteristics =
      await device.characteristicsForService(SERVICE_UUID);
    if (characteristics.some((c) => c.uuid.toLowerCase() === PTT_CHAR_UUID)) {
      this.subscriptions.push(
        device.monitorCharacteristicForService(
          SERVICE_UUID,
          PTT_CHAR_UUID,
          (error, c) => {
            if (!error && c?.value && base64ToBytes(c.value)[0] === 1)
              this.onPushToTalk.emit();
          },
        ),
      );
    }
    this.reconnectAttempt = 0;
    this.clearError();
    this.setStatus("connected");
    this.onConnected.emit(device.id);
  }

  private scheduleReconnect(deviceId: string): void {
    if (this.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempt = 0;
      this.connectedDeviceId = null;
      this.reportError("Device disconnected", "connect");
      this.setStatus("disconnected");
      return;
    }
    this.setStatus("reconnecting");
    const delay = reconnectDelayMs(this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.attach(deviceId).catch(() => {
        if (!this.userDisconnected) {
          this.scheduleReconnect(deviceId);
        }
      });
    }, delay);
  }

  /** Silent reconnect to a remembered helmet at app start. */
  async reconnectTo(deviceId: string): Promise<boolean> {
    if (this.status !== "disconnected") {
      return false;
    }
    const permission = await requestBlePermissions();
    if (permission !== "granted") {
      return false;
    }
    this.userDisconnected = false;
    this.setStatus("connecting");
    try {
      await this.attach(deviceId);
      return true;
    } catch {
      this.setStatus("disconnected");
      return false;
    }
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = 0;
    if (this.status === "reconnecting") {
      this.setStatus("disconnected");
    }
  }

  async disconnect(): Promise<void> {
    this.userDisconnected = true;
    this.cancelReconnect();
    const deviceId = this.device?.id ?? this.connectedDeviceId;
    this.device = null;
    this.connectedDeviceId = null;
    this.clearSubscriptions();
    this.setStatus("disconnected");
    if (deviceId) {
      // Already-disconnected is not an error we care about here.
      await this.manager
        .cancelDeviceConnection(deviceId)
        .catch(() => undefined);
    }
  }

  async sendNavigation(
    direction: NavigationDirection,
    distanceMeters: number,
  ): Promise<void> {
    await this.write(
      NAV_CHAR_UUID,
      "nav",
      encodeNavigationPacket(direction, distanceMeters),
    );
  }

  async sendCallAlert(
    eventType: CallEventType,
    callerName?: string,
  ): Promise<void> {
    await this.write(
      CALL_CHAR_UUID,
      "call",
      encodeCallAlertPacket(eventType, callerName),
    );
  }

  private async write(
    characteristicUUID: string,
    channel: PacketLogEntry["channel"],
    bytes: Uint8Array,
  ): Promise<void> {
    if (!this.device) {
      throw new Error("Not connected to a helmet.");
    }
    try {
      await this.device.writeCharacteristicWithResponseForService(
        SERVICE_UUID,
        characteristicUUID,
        bytesToBase64(bytes),
      );
      this.onPacket.emit({
        at: Date.now(),
        direction: "tx",
        channel,
        hex: toHex(bytes),
      });
    } catch (error) {
      this.reportError((error as Error).message, "write");
      throw error;
    }
  }

  private clearSubscriptions(): void {
    for (const subscription of this.subscriptions) {
      subscription.remove();
    }
    this.subscriptions = [];
  }

  async destroy(): Promise<void> {
    this.userDisconnected = true;
    this.stopScan();
    this.cancelReconnect();
    this.clearSubscriptions();
    await this.manager.destroy();
  }
}
