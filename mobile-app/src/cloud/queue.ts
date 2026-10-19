import AsyncStorage from "@react-native-async-storage/async-storage";
import { cloud, cloudApi } from "./client";
import {
  validateObservation,
  type Observation,
} from "../../../shared/contracts";
import type { RideRecord } from "../history/records";
const QUEUE = "vizor.observation.queue.v1",
  TRIPS = "vizor.trip.queue.v1";
let work = Promise.resolve();
type PendingObservation = Observation & { _owner?: string | null };
function serialize(job: () => Promise<void>) {
  const result = work.then(job);
  work = result.catch(() => {});
  return result;
}
export function enqueueObservation(observation: Observation): Promise<void> {
  return serialize(async () => {
    validateObservation(observation);
    const owner =
      (await cloud?.auth.getSession())?.data.session?.user.id || null;
    const queue: PendingObservation[] = JSON.parse(
      (await AsyncStorage.getItem(QUEUE)) || "[]",
    );
    if (!queue.some((o) => o.eventId === observation.eventId))
      queue.push({ ...observation, _owner: owner });
    await AsyncStorage.setItem(QUEUE, JSON.stringify(queue));
  });
}
export function enqueueRide(ride: RideRecord): Promise<void> {
  return serialize(async () => {
    const owner = (await cloud?.auth.getSession())?.data.session?.user.id;
    if (!owner) return;
    const trips = JSON.parse((await AsyncStorage.getItem(TRIPS)) || "[]");
    trips.push({
      user_id: owner,
      client_id: ride.id,
      started_at: new Date(ride.startedAt).toISOString(),
      ended_at: new Date(ride.endedAt).toISOString(),
      distance_m: ride.distanceMeters,
      destination: ride.destination,
      hazard_count: ride.hazardCount,
    });
    await AsyncStorage.setItem(TRIPS, JSON.stringify(trips));
  });
}
export function syncObservations(): Promise<void> {
  return serialize(async () => {
    if (!cloud) return;
    const {
      data: { session },
    } = await cloud.auth.getSession();
    if (!session) return;
    const queue: PendingObservation[] = JSON.parse(
      (await AsyncStorage.getItem(QUEUE)) || "[]",
    );
    const remaining: PendingObservation[] = [];
    for (const { _owner, ...item } of queue) {
      if (_owner && _owner !== session.user.id) {
        remaining.push({ ...item, _owner });
        continue;
      }
      try {
        await cloudApi("observe", item);
      } catch {
        remaining.push({ ...item, _owner: session.user.id });
      }
    }
    await AsyncStorage.setItem(QUEUE, JSON.stringify(remaining));
    const trips = JSON.parse((await AsyncStorage.getItem(TRIPS)) || "[]"),
      waiting = [];
    for (const trip of trips) {
      if (trip.user_id !== session.user.id) {
        waiting.push(trip);
        continue;
      }
      const { error } = await cloud
        .from("ride_sessions")
        .upsert(trip, { onConflict: "user_id,client_id" });
      if (error) waiting.push(trip);
    }
    await AsyncStorage.setItem(TRIPS, JSON.stringify(waiting));
  });
}
export async function queuedCount() {
  return JSON.parse((await AsyncStorage.getItem(QUEUE)) || "[]")
    .length as number;
}
