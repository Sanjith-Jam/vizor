import { colors } from "../theme";
import type { ConnectionStatus } from "../ble/HelmetConnection";

export const STATUS_META: Record<ConnectionStatus, { label: string; color: string }> = {
  disconnected: { label: "Not connected", color: colors.textMuted },
  scanning: { label: "Searching…", color: colors.accent },
  connecting: { label: "Connecting…", color: colors.accent },
  connected: { label: "Connected", color: colors.success },
  reconnecting: { label: "Reconnecting…", color: colors.warning },
};
