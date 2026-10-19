import { PermissionsAndroid, Platform, type Permission } from "react-native";

export type PermissionResult = "granted" | "denied" | "blocked";

/**
 * Runtime permissions the BLE scan needs. Declaring them in the manifest
 * (react-native-ble-plx's config plugin does that) isn't enough: Android 12+
 * also requires asking at runtime, and without it every scan fails with
 * "Device is not authorized to use BluetoothLE".
 *
 * - Android 12+ (API 31): BLUETOOTH_SCAN + BLUETOOTH_CONNECT, plus fine
 *   location because the manifest doesn't set neverForLocation (the app
 *   also needs location for turn-by-turn navigation).
 * - Android 6-11: fine location is what gates BLE scan results.
 * - iOS: the system prompts on first BleManager use; nothing to request here.
 */
function requiredPermissions(): Permission[] {
  const P = PermissionsAndroid.PERMISSIONS;
  if (Platform.OS !== "android") {
    return [];
  }
  if (typeof Platform.Version === "number" && Platform.Version >= 31) {
    return [P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT, P.ACCESS_FINE_LOCATION];
  }
  return [P.ACCESS_FINE_LOCATION];
}

export async function hasBlePermissions(): Promise<boolean> {
  const perms = requiredPermissions();
  for (const permission of perms) {
    if (!(await PermissionsAndroid.check(permission))) {
      return false;
    }
  }
  return true;
}

export async function requestBlePermissions(): Promise<PermissionResult> {
  const perms = requiredPermissions();
  if (perms.length === 0) {
    return "granted";
  }
  const results = await PermissionsAndroid.requestMultiple(perms);
  const values = perms.map((p) => results[p]);
  if (values.every((v) => v === PermissionsAndroid.RESULTS.GRANTED)) {
    return "granted";
  }
  if (values.some((v) => v === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)) {
    return "blocked";
  }
  return "denied";
}
