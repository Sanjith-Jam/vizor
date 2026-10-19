import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { cloud, cloudApi } from "./client";
import { useCloud } from "./useCloud";
import type { InferenceState } from "../../../shared/contracts";
const EMPTY: InferenceState = {
  devices: [],
  jobs: [],
  telemetry: [],
  observations: [],
};
export function usePhotoJobs() {
  const { session } = useCloud();
  const [data, setData] = useState(EMPTY),
    [error, setError] = useState(""),
    [sync, setSync] = useState("Not signed in");
  const [now, setNow] = useState(Date.now());
  const alive = useRef(false);
  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const next = await cloudApi<InferenceState>("inferenceState");
      if (alive.current) {
        setData(next);
        setNow(Date.now());
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    }
  }, [session?.user.id]);
  useEffect(() => {
    setData(EMPTY);
    setError("");
  }, [session?.user.id]);
  useFocusEffect(
    useCallback(() => {
      alive.current = true;
      if (!cloud || !session) {
        setSync("Not signed in");
        return () => {
          alive.current = false;
        };
      }
      void refresh();
      let timer: ReturnType<typeof setTimeout>;
      const changed = () => {
        clearTimeout(timer);
        timer = setTimeout(() => void refresh(), 300);
      };
      const channel = cloud
        .channel("photo-lab-app")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "inference_jobs" },
          changed,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "observations" },
          changed,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "devices" },
          changed,
        )
        .subscribe((status) => {
          if (!alive.current) return;
          setSync(
            status === "SUBSCRIBED"
              ? "Live sync"
              : status === "CHANNEL_ERROR" || status === "TIMED_OUT"
                ? "Connection interrupted"
                : "Connecting",
          );
          if (status === "SUBSCRIBED") void refresh();
        });
      const app = AppState.addEventListener("change", (s) => {
        if (s === "active") void refresh();
      });
      const clock = setInterval(() => setNow(Date.now()), 15000);
      return () => {
        alive.current = false;
        clearTimeout(timer);
        clearInterval(clock);
        app.remove();
        void cloud!.removeChannel(channel);
      };
    }, [session?.user.id, refresh]),
  );
  return { data, error, setError, sync, refresh, now, session };
}
