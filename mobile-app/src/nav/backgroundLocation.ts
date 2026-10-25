import { cloudApi } from "../cloud/client";
import { fetchRoute } from "./osrmClient";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Speech from "expo-speech";
import { computeProgress } from "./route";
import { haversineMeters } from "./geo";
import { parseCheckpoint, type RideCheckpoint } from "./rideCheckpoint";
import { getHelmetConnection } from "../ble/connectionInstance";
import type { Pothole } from "../../../shared/contracts";
import type { RoadConditions } from "../../../shared/roadConditions";
import {
  MARKED_SPEED_BREAKERS_KEY,
  parseMarkedSpeedBreakers,
  SHARED_SPEED_BREAKERS_KEY,
  ROUTE_ROAD_KEY,
  upcomingRoadAlerts,
  type RoadAlertKind,
} from "../../../shared/roadAlerts";
import { RoadAlertType } from "../protocol/roadAlertProtocol";
const ROAD_ALERT_TYPES: Record<RoadAlertKind, RoadAlertType> = {
  pothole: RoadAlertType.POTHOLE,
  speed_breaker: RoadAlertType.SPEED_BREAKER,
  bad_road: RoadAlertType.BAD_ROAD,
};
export const BACKGROUND_LOCATION_TASK = "AR_HELMET_BACKGROUND_LOCATION_TASK";
export const RIDE_CHECKPOINT_KEY = "vizor.active-ride.v1";
type Listener = (location: Location.LocationObject) => void;
const listeners = new Set<Listener>();
let pending = Promise.resolve();
export function attachBackgroundListener(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
let writes = Promise.resolve();
export function clearRideCheckpoint() {
  writes = writes
    .catch(() => {})
    .then(() => AsyncStorage.removeItem(RIDE_CHECKPOINT_KEY));
  return writes;
}
export function saveRideCheckpoint(
  state: Partial<RideCheckpoint>,
  settings: RideCheckpoint["settings"],
) {
  writes = writes
    .catch(() => {})
    .then(async () => {
      const old = parseCheckpoint(
        await AsyncStorage.getItem(RIDE_CHECKPOINT_KEY),
      );
      const checkpoint = {
        lastPrompt: "",
        lastReconnectAt: 0,
        warned: [],
        ...old,
        ...state,
        settings,
      };
      await AsyncStorage.setItem(
        RIDE_CHECKPOINT_KEY,
        JSON.stringify(checkpoint),
      );
    });
  return writes;
}
async function commitDetached(state: RideCheckpoint) {
  writes = writes
    .catch(() => {})
    .then(async () => {
      const current = parseCheckpoint(
        await AsyncStorage.getItem(RIDE_CHECKPOINT_KEY),
      );
      if (current?.startedAt === state.startedAt)
        await AsyncStorage.setItem(RIDE_CHECKPOINT_KEY, JSON.stringify(state));
    });
  await writes;
}
async function processDetached(loc: Location.LocationObject) {
  const state = parseCheckpoint(
    await AsyncStorage.getItem(RIDE_CHECKPOINT_KEY),
  );
  if (
    !state ||
    loc.timestamp <= (state.lastLocationAt || 0) ||
    (loc.coords.accuracy ?? Infinity) > 50
  )
    return;
  const position = { lat: loc.coords.latitude, lon: loc.coords.longitude };
  if (state.lastPos) {
    const d = haversineMeters(state.lastPos, position);
    if (d > 3) state.distance += d;
  }
  state.lastPos = position;
  state.lastLocationAt = loc.timestamp;
  state.maxSpeed = Math.max(state.maxSpeed, loc.coords.speed || 0);
  if (Date.now() - (state.lastHazardsAt || 0) > 30000) {
    state.lastHazardsAt = Date.now();
    try {
      const data = await cloudApi<Pothole[]>("map", {
        bounds: {
          south: position.lat - 0.04,
          north: position.lat + 0.04,
          west: position.lon - 0.04,
          east: position.lon + 0.04,
        },
      });
      await AsyncStorage.setItem("vizor.road-hazards.v1", JSON.stringify(data));
    } catch {}
  }
  const connection = getHelmetConnection();
  if (
    connection.status === "disconnected" &&
    state.settings.autoReconnect &&
    state.settings.lastDeviceId &&
    Date.now() - (state.lastReconnectAt || 0) > 30000
  ) {
    state.lastReconnectAt = Date.now();
    await connection.reconnectTo(state.settings.lastDeviceId);
  }
  if (state.route) {
    const p = computeProgress(state.route, position, state.nextStep);
    state.nextStep = p.nextStepIndex;
    if (
      p.offRoute &&
      state.destination &&
      Date.now() - (state.lastRerouteAt || 0) > 15000
    ) {
      state.lastRerouteAt = Date.now();
      try {
        state.route = await fetchRoute(position, state.destination.location);
        state.nextStep = 1;
        await commitDetached(state);
        return;
      } catch {}
    }
    if (
      connection.status === "connected" &&
      Date.now() - (state.lastSendAt || 0) > 2000
    ) {
      await connection
        .sendNavigation(p.direction, p.distanceToManeuver)
        .catch(() => {});
      state.lastSendAt = Date.now();
    }
    const key = `${p.nextStepIndex}:${p.distanceToManeuver < 50 ? "near" : p.distanceToManeuver < 200 ? "soon" : "far"}`;
    if (
      Date.now() >= (state.warningUntil || 0) &&
      p.distanceToManeuver < 200 &&
      key !== state.lastPrompt
    ) {
      state.lastPrompt = key;
      if (state.settings.voicePrompts)
        Speech.speak(
          state.route.steps[p.nextStepIndex]?.instruction ||
            "Continue straight.",
        );
    }
    let hazards: Pothole[] = [];
    try {
      hazards = JSON.parse(
        (await AsyncStorage.getItem("vizor.road-hazards.v1")) || "[]",
      );
    } catch {}
    let road: RoadConditions = { speedBreakers: [], roads: [] };
    try {
      road = {
        speedBreakers: [],
        roads: [],
        ...JSON.parse((await AsyncStorage.getItem(ROUTE_ROAD_KEY)) || "{}"),
      };
    } catch {}
    const marked = [
      ...parseMarkedSpeedBreakers(
        await AsyncStorage.getItem(MARKED_SPEED_BREAKERS_KEY).catch(() => null),
      ),
      ...parseMarkedSpeedBreakers(
        await AsyncStorage.getItem(SHARED_SPEED_BREAKERS_KEY).catch(() => null),
      ),
    ];
    const alerts = upcomingRoadAlerts(state.route.geometry, position, {
      potholes: hazards,
      speedBreakers: [...road.speedBreakers, ...marked],
      roads: road.roads,
    });
    for (const a of alerts) {
      if (!state.warned.includes(a.id)) {
        state.warned.push(a.id);
        state.warningUntil = Date.now() + 4000;
        if (state.settings.voicePrompts) {
          Speech.stop();
          Speech.speak(a.message);
        }
        if (connection.status === "connected")
          await connection
            .sendRoadAlert(ROAD_ALERT_TYPES[a.kind], a.ahead)
            .catch(() => {});
        break;
      }
    }
  }
  await commitDetached(state);
}
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const locations = (data as { locations?: Location.LocationObject[] })
    ?.locations;
  if (!locations?.length) return;
  const latest = locations.at(-1)!;
  if (listeners.size) {
    for (const listener of listeners) listener(latest);
  } else {
    pending = pending
      .then(() => processDetached(latest))
      .catch((e) =>
        console.warn("Background ride processing failed", e.message),
      );
    await pending;
  }
});
export async function isBackgroundTrackingActive() {
  return Location.hasStartedLocationUpdatesAsync(
    BACKGROUND_LOCATION_TASK,
  ).catch(() => false);
}
export async function startBackgroundTracking(
  listener: Listener,
): Promise<boolean> {
  const permission = await Location.requestBackgroundPermissionsAsync();
  if (!permission.granted) return false;
  listeners.add(listener);
  try {
    if (!(await isBackgroundTrackingActive()))
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 3,
        pausesUpdatesAutomatically: false,
        foregroundService: {
          notificationTitle: "Vizor navigation active",
          notificationBody: "Your route and road warnings stay connected.",
          notificationColor: "#E5F42B",
        },
      });
    return true;
  } catch {
    listeners.delete(listener);
    return false;
  }
}
export async function stopBackgroundTracking(listener?: Listener) {
  if (listener) listeners.delete(listener);
  else listeners.clear();
  if (!listeners.size && (await isBackgroundTrackingActive()))
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
}
export function detachBackgroundListener(listener: Listener) {
  listeners.delete(listener);
}
