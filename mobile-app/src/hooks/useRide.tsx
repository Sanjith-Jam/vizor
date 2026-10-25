import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import * as Haptics from "expo-haptics";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { Linking } from "react-native";
import { fetchRoute, type Place } from "../nav/osrmClient";
import {
  computeProgress,
  promptBandFor,
  type Route,
  type RouteProgress,
} from "../nav/route";
import { formatDistance, haversineMeters, type LatLon } from "../nav/geo";
import { useCloud } from "../cloud/useCloud";
import {
  EMPTY_ROAD_CONDITIONS,
  type RoadConditions,
} from "../../../shared/roadConditions";
import {
  fetchRouteConditions,
  mergeRoadConditions,
  ROUTE_ROAD_KEY,
  upcomingRoadAlerts,
  type RoadAlertKind,
} from "../../../shared/roadAlerts";
import { RoadAlertType } from "../protocol/roadAlertProtocol";
import { useMarkedBreakers } from "../nav/markedBreakers";
import { NavigationDirection } from "../protocol/navigationProtocol";
import { useHelmetConnection } from "./useHelmetConnection";
import { useHistory } from "./useHistory";
import { useSettings } from "./useSettings";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { parseCheckpoint } from "../nav/rideCheckpoint";
import {
  startBackgroundTracking,
  stopBackgroundTracking,
  saveRideCheckpoint,
  clearRideCheckpoint,
  RIDE_CHECKPOINT_KEY,
  attachBackgroundListener,
  detachBackgroundListener,
} from "../nav/backgroundLocation";

export type RidePhase = "idle" | "starting" | "active";

interface RideContextValue {
  phase: RidePhase;
  destination: Place | null;
  route: Route | null;
  progress: RouteProgress | null;
  position: LatLon | null;
  speedMps: number;
  distanceTravelled: number;
  maxSpeedMps: number;
  startedAt: number | null;
  rerouting: boolean;
  error: string | null;
  /** True when location permission was permanently denied (needs system settings). */
  locationBlocked: boolean;
  /** Speed breakers and rough roads along the route, plus rider marks. */
  roadAhead: RoadConditions;
  /** HUD frame currently shown on the helmet (or that would be, if connected). */
  hudFrame: { direction: NavigationDirection; distance: number } | null;
  startRide: (destination: Place | null, preview?: Route) => Promise<void>;
  endRide: () => void;
  getCurrentPosition: () => Promise<LatLon | null>;
  openLocationSettings: () => void;
}

const RideContext = createContext<RideContextValue | null>(null);

const KEEP_AWAKE_TAG = "ride";
const SEND_INTERVAL_MS = 2000;
const SEND_MIN_DELTA_M = 10;
const REROUTE_COOLDOWN_MS = 15_000;
const MIN_ACCURACY_M = 50;
const ROAD_ALERT_TYPES: Record<RoadAlertKind, RoadAlertType> = {
  pothole: RoadAlertType.POTHOLE,
  speed_breaker: RoadAlertType.SPEED_BREAKER,
  bad_road: RoadAlertType.BAD_ROAD,
};

function speak(enabled: boolean, text: string) {
  if (enabled) {
    Speech.stop();
    Speech.speak(text);
  }
}

export function RideProvider({ children }: { children: React.ReactNode }) {
  const { connection, status } = useHelmetConnection();
  const { addRide, hazards } = useHistory();
  const road = useCloud();
  const roadRef = useRef(road);
  roadRef.current = road;
  const warned = useRef(new Set<string>());
  const warningUntil = useRef(0);
  const { settings, loaded } = useSettings();

  const [phase, setPhase] = useState<RidePhase>("idle");
  const [destination, setDestination] = useState<Place | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [progress, setProgress] = useState<RouteProgress | null>(null);
  const [position, setPosition] = useState<LatLon | null>(null);
  const [speedMps, setSpeedMps] = useState(0);
  const [distanceTravelled, setDistanceTravelled] = useState(0);
  const [maxSpeedMps, setMaxSpeedMps] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [rerouting, setRerouting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationBlocked, setLocationBlocked] = useState(false);
  const [hudFrame, setHudFrame] = useState<RideContextValue["hudFrame"]>(null);
  const [routeRoad, setRouteRoad] = useState(EMPTY_ROAD_CONDITIONS);
  const marked = useMarkedBreakers();
  const roadAhead = React.useMemo(
    () =>
      mergeRoadConditions(routeRoad, {
        speedBreakers: [...marked, ...road.sharedBreakers],
        roads: [],
      }),
    [routeRoad, marked, road.sharedBreakers],
  );
  const roadAheadRef = useRef(roadAhead);
  roadAheadRef.current = roadAhead;
  useEffect(() => {
    // Whole-route road data; the background task reads the saved copy.
    setRouteRoad(EMPTY_ROAD_CONDITIONS);
    if (!route) {
      void AsyncStorage.removeItem(ROUTE_ROAD_KEY).catch(() => undefined);
      return;
    }
    const controller = new AbortController();
    fetchRouteConditions(
      [route.geometry],
      roadRef.current.hazards,
      controller.signal,
    )
      .then((data) => {
        setRouteRoad(data);
        void AsyncStorage.setItem(ROUTE_ROAD_KEY, JSON.stringify(data)).catch(
          () => undefined,
        );
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [route]);

  // Mutable ride state read inside the location callback.
  const r = useRef({
    sub: null as Location.LocationSubscription | null,
    route: null as Route | null,
    destination: null as Place | null,
    nextStep: 1,
    announced: new Set<number>(),
    lastPos: null as LatLon | null,
    distance: 0,
    maxSpeed: 0,
    lastSendAt: 0,
    lastSentDist: -1,
    lastSentStep: -1,
    lastRerouteAt: 0,
    arrivedSpoken: false,
    startedAt: 0,
    lastLocationAt: 0,
  });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const connectedRef = useRef(status === "connected");
  connectedRef.current = status === "connected";

  const sendToHelmet = useCallback(
    (direction: NavigationDirection, distance: number) => {
      setHudFrame({ direction, distance });
      if (connectedRef.current) {
        connection.sendNavigation(direction, distance).catch(() => undefined);
      }
    },
    [connection],
  );

  const ensurePermission = useCallback(async (): Promise<boolean> => {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.granted) {
      setLocationBlocked(false);
      return true;
    }
    const asked = await Location.requestForegroundPermissionsAsync();
    setLocationBlocked(!asked.granted && !asked.canAskAgain);
    if (!asked.granted) {
      setError(
        "Location permission is needed for navigation and ride tracking.",
      );
      return false;
    }
    if (!(await Location.hasServicesEnabledAsync())) {
      setError(
        "Location (GPS) is turned off. Turn it on in your phone's quick settings.",
      );
      return false;
    }
    return true;
  }, []);

  const getCurrentPosition = useCallback(async (): Promise<LatLon | null> => {
    if (!(await ensurePermission())) {
      return null;
    }
    try {
      const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
      const loc =
        last ??
        (await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }));
      return { lat: loc.coords.latitude, lon: loc.coords.longitude };
    } catch {
      setError("Couldn't get your location. Make sure GPS is on.");
      return null;
    }
  }, [ensurePermission]);

  const reroute = useCallback(async (from: LatLon) => {
    const s = r.current;
    if (!s.destination) return;
    s.lastRerouteAt = Date.now();
    setRerouting(true);
    speak(settingsRef.current.voicePrompts, "Recalculating route.");
    try {
      const next = await fetchRoute(from, s.destination.location);
      s.route = next;
      s.nextStep = 1;
      s.announced = new Set();
      s.lastSentStep = -1;
      setRoute(next);
    } catch {
      // Keep the old route; another attempt happens after the cooldown.
    } finally {
      setRerouting(false);
    }
  }, []);

  const onLocation = useCallback(
    (loc: Location.LocationObject) => {
      const s = r.current;
      if (!s.startedAt || loc.timestamp <= s.lastLocationAt) return;
      s.lastLocationAt = loc.timestamp;
      const pos = { lat: loc.coords.latitude, lon: loc.coords.longitude };
      const accuracy = loc.coords.accuracy ?? Infinity;
      const speed = Math.max(0, loc.coords.speed ?? 0);
      const now = Date.now();
      const cfg = settingsRef.current;

      setPosition(pos);
      setSpeedMps(speed);
      if (accuracy <= MIN_ACCURACY_M) void roadRef.current.loadHazards(pos);

      if (accuracy <= MIN_ACCURACY_M) {
        if (s.lastPos) {
          const step = haversineMeters(s.lastPos, pos);
          // Ignore GPS jitter while standing still.
          if (step > 3) {
            s.distance += step;
            setDistanceTravelled(s.distance);
            s.lastPos = pos;
          }
        } else {
          s.lastPos = pos;
        }
        if (speed > s.maxSpeed) {
          s.maxSpeed = speed;
          setMaxSpeedMps(speed);
        }
      }

      void saveRideCheckpoint(
        {
          startedAt: s.startedAt,
          route: s.route,
          destination: s.destination,
          lastPos: pos,
          nextStep: s.nextStep,
          distance: s.distance,
          maxSpeed: s.maxSpeed,
          lastLocationAt: loc.timestamp,
          lastSendAt: s.lastSendAt,
          warned: [...warned.current],
        },
        cfg,
      );
      if (!s.route) {
        return;
      }

      if (accuracy > MIN_ACCURACY_M) return;
      const p = computeProgress(s.route, pos, s.nextStep);
      const ahead = upcomingRoadAlerts(s.route.geometry, pos, {
        ...roadAheadRef.current,
        potholes: roadRef.current.hazards,
      }).find((a) => !warned.current.has(a.id));
      if (ahead) {
        warned.current.add(ahead.id);
        warningUntil.current = Date.now() + 4000;
        speak(cfg.voicePrompts, ahead.message);
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Warning,
        );
        if (connectedRef.current)
          connection
            .sendRoadAlert(ROAD_ALERT_TYPES[ahead.kind], ahead.ahead)
            .catch(() => undefined);
        return;
      }
      if (p.nextStepIndex !== s.nextStep) {
        s.nextStep = p.nextStepIndex;
        s.announced = new Set();
      }
      setProgress(p);
      void saveRideCheckpoint({ nextStep: s.nextStep }, cfg);

      if (p.arrived) {
        if (!s.arrivedSpoken) {
          s.arrivedSpoken = true;
          sendToHelmet(NavigationDirection.DESTINATION, 0);
          speak(cfg.voicePrompts, "You have arrived at your destination.");
        }
        return;
      }

      if (
        p.offRoute &&
        accuracy <= MIN_ACCURACY_M &&
        now - s.lastRerouteAt > REROUTE_COOLDOWN_MS
      ) {
        void reroute(pos);
        return;
      }

      const stepChanged = s.lastSentStep !== p.nextStepIndex;
      const moved =
        Math.abs(p.distanceToManeuver - s.lastSentDist) >= SEND_MIN_DELTA_M;
      if (stepChanged || (moved && now - s.lastSendAt >= SEND_INTERVAL_MS)) {
        s.lastSendAt = now;
        s.lastSentDist = p.distanceToManeuver;
        s.lastSentStep = p.nextStepIndex;
        sendToHelmet(p.direction, p.distanceToManeuver);
      }

      const band = promptBandFor(p.distanceToManeuver, s.announced);
      if (band !== null && Date.now() >= warningUntil.current) {
        s.announced.add(band);
        const step = s.route.steps[p.nextStepIndex];
        if (step) {
          const text =
            band === 50
              ? `${step.instruction}.`
              : `In ${formatDistance(p.distanceToManeuver, cfg.units)}, ${step.instruction}.`;
          speak(
            cfg.voicePrompts,
            text.replace(" km", " kilometres").replace(" m,", " metres,"),
          );
        }
      }
    },
    [reroute, sendToHelmet],
  );

  const endRide = useCallback(() => {
    const s = r.current;
    s.sub?.remove();
    s.sub = null;
    void stopBackgroundTracking();
    void clearRideCheckpoint();
    deactivateKeepAwake(KEEP_AWAKE_TAG);
    Speech.stop();

    if (s.startedAt) {
      const endedAt = Date.now();
      if (s.distance > 50 || endedAt - s.startedAt > 60_000) {
        addRide({
          id: String(s.startedAt),
          startedAt: s.startedAt,
          endedAt,
          distanceMeters: Math.round(s.distance),
          maxSpeedMps: s.maxSpeed,
          destination: s.destination?.name ?? null,
          hazardCount: hazards.filter((h) => h.at >= s.startedAt).length,
        });
      }
    }

    s.route = null;
    s.destination = null;
    s.startedAt = 0;
    setPhase("idle");
    setRoute(null);
    setProgress(null);
    setDestination(null);
    setHudFrame(null);
    setStartedAt(null);
  }, [addRide, hazards]);

  const startRide = useCallback(
    async (dest: Place | null, preview?: Route) => {
      setError(null);
      warned.current.clear();
      setPhase("starting");
      const here = await getCurrentPosition();
      if (!here) {
        setPhase("idle");
        return;
      }

      let planned: Route | null = null;
      if (dest) {
        try {
          planned =
            preview &&
            preview.geometry.length > 0 &&
            haversineMeters(here, preview.geometry[0]) < 50
              ? preview
              : await fetchRoute(here, dest.location);
        } catch (e) {
          setError((e as Error).message);
          setPhase("idle");
          return;
        }
      }

      const s = r.current;
      s.sub?.remove();
      Object.assign(s, {
        route: planned,
        destination: dest,
        nextStep: 1,
        announced: new Set<number>(),
        lastPos: here,
        distance: 0,
        maxSpeed: 0,
        lastSendAt: 0,
        lastSentDist: -1,
        lastSentStep: -1,
        lastRerouteAt: Date.now(),
        arrivedSpoken: false,
        startedAt: Date.now(),
        lastLocationAt: 0,
      });

      setDestination(dest);
      setRoute(planned);
      setPosition(here);
      setDistanceTravelled(0);
      setMaxSpeedMps(0);
      setStartedAt(s.startedAt);
      setProgress(planned ? computeProgress(planned, here) : null);

      try {
        s.sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 1000,
            distanceInterval: 3,
          },
          onLocation,
        );
        const background = await startBackgroundTracking(onLocation);
        if (!background)
          setError(
            "Background location is unavailable. Keep the app open for guidance.",
          );
        await saveRideCheckpoint(
          {
            startedAt: s.startedAt,
            route: planned,
            destination: dest,
            lastPos: here,
            nextStep: 1,
            distance: 0,
            maxSpeed: 0,
            lastLocationAt: 0,
            lastSendAt: 0,
            lastPrompt: "",
            lastReconnectAt: 0,
            warned: [],
          },
          settingsRef.current,
        );
      } catch {
        setError("Couldn't start GPS tracking.");
        setPhase("idle");
        return;
      }

      await activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
      setPhase("active");
      if (planned && planned.steps[1]) {
        const first = computeProgress(planned, here);
        sendToHelmet(first.direction, first.distanceToManeuver);
        speak(
          settingsRef.current.voicePrompts,
          `Starting navigation to ${dest?.name}. ${planned.steps[1].instruction} in ${formatDistance(first.distanceToManeuver, settingsRef.current.units)}.`,
        );
      } else {
        speak(settingsRef.current.voicePrompts, "Ride started.");
      }
    },
    [getCurrentPosition, onLocation, sendToHelmet],
  );

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    void AsyncStorage.getItem(RIDE_CHECKPOINT_KEY).then((raw) => {
      const saved = parseCheckpoint(raw);
      if (!saved || cancelled || r.current.startedAt) return;
      Object.assign(r.current, saved, {
        announced: new Set<number>(),
        sub: null,
      });
      warned.current = new Set(saved.warned);
      setPhase("active");
      setDestination(saved.destination);
      setRoute(saved.route);
      setPosition(saved.lastPos);
      setDistanceTravelled(saved.distance);
      setMaxSpeedMps(saved.maxSpeed);
      setStartedAt(saved.startedAt);
      if (saved.route && saved.lastPos)
        setProgress(
          computeProgress(saved.route, saved.lastPos, saved.nextStep),
        );
      attachBackgroundListener(onLocation);
      void startBackgroundTracking(onLocation).then(async (background) => {
        if (cancelled) {
          detachBackgroundListener(onLocation);
          return;
        }
        if (!background) {
          setError(
            "Background location is unavailable. Keep the app open for guidance.",
          );
          try {
            const sub = await Location.watchPositionAsync(
              {
                accuracy: Location.Accuracy.BestForNavigation,
                timeInterval: 1000,
                distanceInterval: 3,
              },
              onLocation,
            );
            if (cancelled) sub.remove();
            else r.current.sub = sub;
          } catch {
            setError(
              "Ride recovery needs location permission. Allow it in system settings or end this ride.",
            );
          }
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [loaded, onLocation]);

  // Push the current arrow again whenever the helmet (re)connects mid-ride.
  useEffect(() => {
    if (status === "connected" && hudFrame) {
      connection
        .sendNavigation(hudFrame.direction, hudFrame.distance)
        .catch(() => undefined);
    }
    // Only on connection changes, not on every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(
    () => () => {
      r.current.sub?.remove();
      detachBackgroundListener(onLocation);
    },
    [onLocation],
  );

  return (
    <RideContext.Provider
      value={{
        phase,
        destination,
        route,
        progress,
        position,
        speedMps,
        distanceTravelled,
        maxSpeedMps,
        startedAt,
        rerouting,
        error,
        locationBlocked,
        roadAhead,
        hudFrame,
        startRide,
        endRide,
        getCurrentPosition,
        openLocationSettings: () => void Linking.openSettings(),
      }}
    >
      {children}
    </RideContext.Provider>
  );
}

export function useRide(): RideContextValue {
  const value = useContext(RideContext);
  if (!value) {
    throw new Error("useRide must be used within a RideProvider");
  }
  return value;
}
