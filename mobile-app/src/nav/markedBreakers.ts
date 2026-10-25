import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { cloudApi } from "../cloud/client";
import type { Point } from "../../../shared/contracts";
import type { SpeedBreaker } from "../../../shared/roadConditions";
import {
  MARKED_SPEED_BREAKERS_KEY,
  markSpeedBreaker,
  parseMarkedSpeedBreakers,
} from "../../../shared/roadAlerts";

/** Speed breakers the rider marked, kept on this phone only. */
let marked: SpeedBreaker[] = [];
let loading: Promise<void> | null = null;
const listeners = new Set<(list: SpeedBreaker[]) => void>();

function publish(next: SpeedBreaker[], persist: boolean) {
  marked = next;
  listeners.forEach((fn) => fn(next));
  if (persist)
    void AsyncStorage.setItem(
      MARKED_SPEED_BREAKERS_KEY,
      JSON.stringify(next),
    ).catch(() => undefined);
}

export function loadMarkedBreakers(): Promise<void> {
  loading ||= AsyncStorage.getItem(MARKED_SPEED_BREAKERS_KEY)
    .then((raw) => publish(parseMarkedSpeedBreakers(raw), false))
    .catch(() => undefined);
  return loading;
}

export function getMarkedBreakers(): SpeedBreaker[] {
  return marked;
}

/** Returns the new mark, or null when one already exists within 15 m. */
export async function addMarkedBreaker(
  at: Point,
  known: SpeedBreaker[],
): Promise<SpeedBreaker | null> {
  await loadMarkedBreakers();
  const next = markSpeedBreaker(marked, at, known);
  if (next === marked) return null;
  publish(next, true);
  return next[next.length - 1];
}

/** Saves a mark on this phone and shares it with Vizor riders. */
export async function markBreakerHere(
  at: Point,
  known: SpeedBreaker[],
): Promise<{ mark: SpeedBreaker | null; shared: boolean }> {
  const mark = await addMarkedBreaker(at, known);
  if (!mark) return { mark, shared: false };
  try {
    await cloudApi("speedBreaker", { location: at, verdict: "mark" });
    return { mark, shared: true };
  } catch {
    return { mark, shared: false };
  }
}

export async function removeMarkedBreaker(id: string): Promise<void> {
  await loadMarkedBreakers();
  publish(
    marked.filter((s) => s.id !== id),
    true,
  );
}

export function useMarkedBreakers(): SpeedBreaker[] {
  const [list, setList] = useState(marked);
  useEffect(() => {
    listeners.add(setList);
    void loadMarkedBreakers();
    return () => {
      listeners.delete(setList);
    };
  }, []);
  return list;
}
