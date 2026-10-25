import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session } from "@supabase/supabase-js";
import { cloud, cloudApi } from "./client";
import { queuedCount, syncObservations, enqueueObservation } from "./queue";
import { useHelmetConnection } from "../hooks/useHelmetConnection";
import { HazardEventType } from "../protocol/hazardProtocol";
import type { Point, Pothole, Telemetry } from "../../../shared/contracts";
import {
  setRoadDataProxy,
  setRoadDataStore,
  sharedSpeedBreakers,
  type SpeedBreaker,
} from "../../../shared/roadConditions";
import { SHARED_SPEED_BREAKERS_KEY } from "../../../shared/roadAlerts";
import { fileRoadDataStore } from "../nav/roadDataStore";
const CACHE = "vizor.road-hazards.v1";
// Signed-in riders use the API's shared Overpass cache; failures fall back
// to the public servers inside shared/roadConditions. The first request for
// an area waits on public Overpass (often 40 s+), so allow longer than the
// default API timeout instead of falling back and leaving the cache empty.
const ROAD_DATA_TIMEOUT_MS = 100_000;
setRoadDataStore(fileRoadDataStore);
if (cloud)
  setRoadDataProxy((request) =>
    cloudApi<{ elements: unknown[] }>(
      "roadData",
      request,
      AbortSignal.timeout(ROAD_DATA_TIMEOUT_MS),
    ).then((r) => r.elements),
  );
const Context = createContext<{
  session: Session | null;
  telemetry: Telemetry | null;
  pending: number;
  error: string | null;
  hazards: Pothole[];
  /** Speed breakers reported by Vizor riders near the last loaded area. */
  sharedBreakers: SpeedBreaker[];
  refresh: () => Promise<void>;
  loadHazards: (p: Point) => Promise<void>;
}>({
  session: null,
  telemetry: null,
  pending: 0,
  error: null,
  hazards: [],
  sharedBreakers: [],
  refresh: async () => {},
  loadHazards: async () => {},
});
export function CloudProvider({ children }: { children: React.ReactNode }) {
  const { connection } = useHelmetConnection();
  const [session, setSession] = useState<Session | null>(null),
    [telemetry, setTelemetry] = useState<Telemetry | null>(null),
    [pending, setPending] = useState(0),
    [error, setError] = useState<string | null>(null),
    [hazards, setHazards] = useState<Pothole[]>([]),
    [sharedBreakers, setSharedBreakers] = useState<SpeedBreaker[]>([]);
  const center = useRef<Point | null>(null),
    lastFetch = useRef(0);
  const loadHazards = useCallback(async (p: Point) => {
    center.current = p;
    if (!cloud || Date.now() - lastFetch.current < 15000) return;
    lastFetch.current = Date.now();
    try {
      const data = await cloudApi<Pothole[]>("map", {
        bounds: {
          south: p.lat - 0.04,
          north: p.lat + 0.04,
          west: p.lon - 0.04,
          east: p.lon + 0.04,
        },
      });
      setHazards(data);
      await AsyncStorage.setItem(CACHE, JSON.stringify(data));
      const breakers = sharedSpeedBreakers(
        await cloudApi<
          { id: string; lat: number; lon: number; status: string }[]
        >("speedBreakers", {
          bounds: {
            south: p.lat - 0.04,
            north: p.lat + 0.04,
            west: p.lon - 0.04,
            east: p.lon + 0.04,
          },
        }),
      );
      setSharedBreakers(breakers);
      await AsyncStorage.setItem(
        SHARED_SPEED_BREAKERS_KEY,
        JSON.stringify(breakers),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  const refresh = useCallback(async () => {
    try {
      setError(null);
      await syncObservations();
      setPending(await queuedCount());
      if (cloud) {
        const {
          data: { session },
        } = await cloud.auth.getSession();
        if (!session) return;
        const { data, error } = await cloud
          .from("helmet_telemetry")
          .select("*")
          .order("recorded_at", { ascending: false })
          .limit(1);
        if (error) throw error;
        setTelemetry(data?.[0] || null);
        if (center.current) {
          lastFetch.current = 0;
          await loadHazards(center.current);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [loadHazards]);
  useEffect(() => {
    void AsyncStorage.getItem(CACHE).then((raw) => {
      try {
        setHazards(JSON.parse(raw || "[]"));
      } catch {}
    });
    if (!cloud) {
      void queuedCount().then(setPending);
      return;
    }
    void cloud.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = cloud.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) {
        setTelemetry(null);
        setHazards([]);
        void AsyncStorage.removeItem(CACHE);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    const app = AppState.addEventListener("change", (s) => {
      if (s === "active") void refresh();
    });
    return () => {
      clearInterval(timer);
      app.remove();
    };
  }, [refresh, session]);
  useEffect(
    () =>
      connection.onHazardEvent.on((event) => {
        if (event.type !== HazardEventType.POTHOLE_BUMP) return;
        void enqueueObservation({
          eventId: `imu-${Date.now()}`,
          source: "imu",
          observedAt: new Date().toISOString(),
          location: event.hasGpsFix ? { lat: event.lat, lon: event.lon } : null,
          accuracyMeters: null,
          confidence: null,
          gForce: event.gForce,
        })
          .then(refresh)
          .catch((e) => setError(e.message));
      }),
    [connection, refresh],
  );
  useEffect(() => {
    if (!cloud || !session) return;
    const channel = cloud
      .channel("road-intelligence")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "helmet_telemetry" },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "potholes" },
        () => {
          if (center.current) {
            lastFetch.current = 0;
            void loadHazards(center.current);
          }
        },
      )
      .subscribe();
    return () => {
      void cloud!.removeChannel(channel);
    };
  }, [session, refresh, loadHazards]);
  return (
    <Context.Provider
      value={{
        session,
        telemetry,
        pending,
        error,
        hazards,
        sharedBreakers,
        refresh,
        loadHazards,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useCloud = () => useContext(Context);
export { cloud, cloudApi };
