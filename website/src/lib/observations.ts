import { supabase } from "./supabase";
import { api } from "./api";
import {
  validateObservation,
  type Observation,
} from "../../../shared/contracts";
const queueStorageName = "vizor.web.observations.v1";
let work = Promise.resolve();
type Queued = { owner: string; observation: Observation };
function serialize(fn: () => Promise<void>) {
  const job = work.then(fn);
  work = job.catch(() => {});
  return job;
}
export function queueObservation(observation: Observation) {
  return serialize(async () => {
    validateObservation(observation);
    const user = (await supabase?.auth.getSession())?.data.session?.user;
    if (!user) throw new Error("Sign in before reporting a hazard.");
    const list: Queued[] = JSON.parse(localStorage.getItem(queueStorageName) || "[]");
    if (
      !list.some(
        (q) =>
          q.owner === user.id && q.observation.eventId === observation.eventId,
      )
    )
      list.push({ owner: user.id, observation });
    localStorage.setItem(queueStorageName, JSON.stringify(list));
  });
}
export function syncObservations() {
  return serialize(async () => {
    const user = (await supabase?.auth.getSession())?.data.session?.user;
    if (!user) return;
    const list: Queued[] = JSON.parse(localStorage.getItem(queueStorageName) || "[]"),
      remaining: Queued[] = [];
    for (const item of list) {
      if (item.owner !== user.id) {
        remaining.push(item);
        continue;
      }
      try {
        await api("observe", item.observation);
      } catch {
        remaining.push(item);
      }
    }
    localStorage.setItem(queueStorageName, JSON.stringify(remaining));
  });
}
export function pendingObservations() {
  try {
    return JSON.parse(localStorage.getItem(queueStorageName) || "[]").length as number;
  } catch {
    return 0;
  }
}
