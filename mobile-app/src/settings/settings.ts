/** App preferences. Pure (no AsyncStorage import) so parsing is unit-tested. */

export type Units = "metric" | "imperial";

export interface AppSettings {
  units: Units;
  voicePrompts: boolean;
  autoReconnect: boolean;
  onboardingDone: boolean;
  lastDeviceId: string | null;
  lastDeviceName: string | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  units: "metric",
  voicePrompts: true,
  autoReconnect: true,
  onboardingDone: false,
  lastDeviceId: null,
  lastDeviceName: null,
};

export function parseSettings(raw: string | null): AppSettings {
  if (!raw) {
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<
      Record<keyof AppSettings, unknown>
    >;
    const out: AppSettings = { ...DEFAULT_SETTINGS };
    if (parsed.units === "metric" || parsed.units === "imperial")
      out.units = parsed.units;
    if (typeof parsed.voicePrompts === "boolean")
      out.voicePrompts = parsed.voicePrompts;
    if (typeof parsed.autoReconnect === "boolean")
      out.autoReconnect = parsed.autoReconnect;
    if (typeof parsed.onboardingDone === "boolean")
      out.onboardingDone = parsed.onboardingDone;
    if (typeof parsed.lastDeviceId === "string")
      out.lastDeviceId = parsed.lastDeviceId;
    if (typeof parsed.lastDeviceName === "string")
      out.lastDeviceName = parsed.lastDeviceName;
    return out;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
