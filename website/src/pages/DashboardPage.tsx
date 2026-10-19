import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bluetooth,
  Mic,
  Search,
  Send,
  Square,
  TriangleAlert,
  X,
  Play,
  Pause,
  User,
  Volume2,
} from "lucide-react";
import { RoadMap } from "../components/RoadMap";
import {
  queueObservation,
  syncObservations,
  pendingObservations,
} from "../lib/observations";
import { api } from "../lib/api";
import { supabase } from "../lib/supabase";
import { DEMO_POTHOLES, DEMO_ROUTE, DEMO_START } from "../../../shared/demo";
import {
  distanceMeters,
  routeHazards,
  upcomingHazards,
  validateReply,
  validateRoutePlans,
  type AssistantReply,
  type Place,
  type Point,
  type Pothole,
  type RoutePlan,
  type Telemetry,
} from "../../../shared/contracts";
import { searchKatpadi, KATPADI_PLACES } from "../../../shared/katpadi";
import { computeProgress } from "../../../mobile-app/src/nav/route";
import type { Route } from "../../../mobile-app/src/nav/route";
async function katpadiRoutes(
  { from, to }: { from: Point; to: Point },
  signal?: AbortSignal,
): Promise<RoutePlan[]> {
  return validateRoutePlans(await api("routes", { from, to }, signal));
}
export function DashboardPage() {
  const demo = useLocation().pathname === "/demo";
  const [potholes, setPotholes] = useState<Pothole[]>(
      demo ? DEMO_POTHOLES : [],
    ),
    [selected, setSelected] = useState<Pothole | null>(null),
    [filter, setFilter] = useState("all"),
    [recorded, setRecorded] = useState(false),
    [pending, setPending] = useState(pendingObservations),
    [evidence, setEvidence] = useState<any[]>([]),
    [query, setQuery] = useState(""),
    [places, setPlaces] = useState<Place[]>([]),
    [routes, setRoutes] = useState<RoutePlan[]>(demo ? [DEMO_ROUTE] : []),
    [routeIndex, setRouteIndex] = useState(0),
    [position, setPosition] = useState<Point | null>(demo ? DEMO_START : null),
    [active, setActive] = useState(false),
    [replaying, setReplaying] = useState(false),
    [telemetry, setTelemetry] = useState<Telemetry | null>(null),
    [message, setMessage] = useState(""),
    [reply, setReply] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [listening, setListening] = useState(false),
    [muted, setMuted] = useState(false),
    [history, setHistory] = useState<any[]>(() => {
      try {
        return JSON.parse(localStorage.getItem("vizor.web.rides") || "[]");
      } catch {
        return [];
      }
    });
  const media = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    request = useRef<AbortController | null>(null),
    routeRequest = useRef<AbortController | null>(null),
    watch = useRef<number | null>(null),
    nextStep = useRef(1),
    announced = useRef(new Set<string>()),
    reroutedAt = useRef(0),
    destination = useRef<Place | null>(null),
    startedAt = useRef(0),
    travelled = useRef(0),
    lastPosition = useRef<Point | null>(null),
    cancelRecording = useRef(false),
    lastBounds = useRef<any>(null),
    warningUntil = useRef(0),
    fixAccuracy = useRef<number | null>(null);
  useEffect(() => {
    if (demo) return;
    const sync = () =>
      void syncObservations()
        .then(() => setPending(pendingObservations()))
        .catch(() => {});
    sync();
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, [demo]);
  const reportHere = () =>
    run(async () => {
      if (demo) {
        setReply("Demo report preview. No live report was created.");
        return;
      }
      const point = await getPosition();
      await queueObservation({
        eventId: crypto.randomUUID(),
        source: "manual",
        observedAt: new Date().toISOString(),
        location: point,
        accuracyMeters: fixAccuracy.current,
        confidence: null,
      });
      await syncObservations();
      setPending(pendingObservations());
      setReply(
        "Observation saved. Offline uploads retry when the connection returns.",
      );
    });
  const route = routes[routeIndex],
    progress =
      route && position
        ? computeProgress(route as Route, position, nextStep.current)
        : null;
  const speak = (text: string) => {
    if (!muted && "speechSynthesis" in window) {
      speechSynthesis.cancel();
      speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    }
  };
  useEffect(() => {
    setPotholes(demo ? DEMO_POTHOLES : []);
    setRoutes(demo ? [DEMO_ROUTE] : []);
    setRouteIndex(0);
    setPosition(demo ? DEMO_START : null);
    setActive(false);
  }, [demo]);
  useEffect(() => {
    setEvidence([]);
    if (demo || !selected) return;
    let cancelled = false;
    api<any[]>("hazardEvidence", { id: selected.id })
      .then(async (rows) => {
        const items = await Promise.all(
          rows.map(async (r) => ({
            ...r,
            url: r.evidence_path
              ? (
                  await api<{ signedUrl: string }>("evidence", {
                    path: r.evidence_path,
                  })
                ).signedUrl
              : null,
          })),
        );
        if (!cancelled) setEvidence(items);
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [selected, demo]);
  useEffect(() => {
    if (demo || !supabase) return;
    const update = () =>
      void supabase!
        .from("helmet_telemetry")
        .select("*")
        .order("recorded_at", { ascending: false })
        .limit(1)
        .then(({ data }) => setTelemetry(data?.[0] || null));
    update();
    const channel = supabase
      .channel("helmet-status")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "potholes" },
        () => {
          if (lastBounds.current)
            void api<Pothole[]>("map", {
              bounds: lastBounds.current,
              replay: recorded,
            })
              .then(setPotholes)
              .catch((e) => setError(e.message));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "helmet_telemetry" },
        update,
      )
      .subscribe();
    return () => {
      void supabase!.removeChannel(channel);
    };
  }, [demo, recorded]);
  useEffect(
    () => () => {
      cancelRecording.current = true;
      request.current?.abort();
      routeRequest.current?.abort();
      media.current?.state === "recording" && media.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      if (timer.current) clearTimeout(timer.current);
      if (watch.current !== null)
        navigator.geolocation.clearWatch(watch.current);
    },
    [],
  );
  useEffect(() => {
    if (!replaying || !demo) return;
    let tick = 0;
    const path = route?.geometry || DEMO_ROUTE.geometry;
    const interval = setInterval(() => {
      if (tick >= path.length) {
        setReplaying(false);
        setActive(false);
        setReply("Katpadi sample ride complete. Reset or replay it again.");
        return;
      }
      setPosition(path[tick]);
      tick++;
    }, 700);
    return () => clearInterval(interval);
  }, [replaying, demo, route]);
  useEffect(() => {
    if (!active || !position || !route || !progress) return;
    if (lastPosition.current) {
      const d = distanceMeters(lastPosition.current, position);
      if (d > 3) travelled.current += d;
    }
    lastPosition.current = position;
    nextStep.current = progress.nextStepIndex;
    const near = upcomingHazards(route.geometry, position, potholes);
    const hazard = near.find((h) => !announced.current.has(h.id));
    if (hazard) {
      announced.current.add(hazard.id);
      warningUntil.current = Date.now() + 4000;
      speak("Reported pothole ahead. Stay aware.");
      setReply("Reported pothole ahead. Stay aware.");
    }
    const step = route.steps[progress.nextStepIndex];
    if (
      Date.now() >= warningUntil.current &&
      step &&
      progress.distanceToManeuver < 200 &&
      !announced.current.has("turn" + progress.nextStepIndex)
    ) {
      announced.current.add("turn" + progress.nextStepIndex);
      speak(step.instruction);
    }
    if (
      !demo &&
      progress.offRoute &&
      destination.current &&
      Date.now() - reroutedAt.current > 15000
    ) {
      reroutedAt.current = Date.now();
      katpadiRoutes({
        from: position,
        to: destination.current.location,
      })
        .then((result) => {
          setRoutes(result);
          setRouteIndex(0);
          nextStep.current = 1;
        })
        .catch((e) => setError(e.message));
    }
  }, [position, active, potholes, route]);
  const run = async (fn: () => Promise<void>) => {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const search = () =>
    run(async () => {
      const results = demo
        ? searchKatpadi(query)
        : await api<Place[]>("places", { query });
      setPlaces(results);
      if (!results.length)
        setReply(
          demo
            ? "No matching sample landmark. Search VIT or Katpadi."
            : "No places found. Try a nearby landmark or choose a map pin.",
        );
    });
  const getPosition = () =>
    new Promise<Point>((resolve, reject) => {
      if (!navigator.geolocation)
        return reject(new Error("This browser does not support location."));
      navigator.geolocation.getCurrentPosition(
        (p) => {
          fixAccuracy.current = p.coords.accuracy;
          const point = { lat: p.coords.latitude, lon: p.coords.longitude };
          setPosition(point);
          resolve(point);
        },
        () => reject(new Error("Allow location access to plan a live route.")),
        { enableHighAccuracy: true, timeout: 15000 },
      );
    });
  const choose = async (place: Place) => {
    routeRequest.current?.abort();
    const controller = new AbortController();
    routeRequest.current = controller;
    setBusy(true);
    setError("");
    destination.current = place;
    setQuery(place.name);
    setPlaces([]);
    setSelected(null);
    if (active) stop();
    setReplaying(false);
    setRoutes([]);
    try {
      const here = demo ? DEMO_START : position || (await getPosition());
      const result =
        demo && place.id === KATPADI_PLACES[1].id
          ? [DEMO_ROUTE]
          : await katpadiRoutes(
              { from: here, to: place.location },
              controller.signal,
            );
      if (controller.signal.aborted) return;
      setRoutes(result);
      if (demo) setPosition(DEMO_START);
      setRouteIndex(0);
      nextStep.current = 1;
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (routeRequest.current === controller) setBusy(false);
    }
  };

  const bounds = (b: {
    south: number;
    north: number;
    west: number;
    east: number;
  }) => {
    lastBounds.current = b;
    if (!demo)
      void api<Pothole[]>("map", { bounds: b, replay: recorded })
        .then(setPotholes)
        .catch((e) => setError(e.message));
  };
  const stop = () => {
    setActive(false);
    setReplaying(false);
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    speechSynthesis?.cancel();
    if (startedAt.current) {
      const record = {
        startedAt: startedAt.current,
        endedAt: Date.now(),
        destination: destination.current?.name || "Demo journey",
        distance: Math.round(travelled.current),
        demo,
      };
      const list = [record, ...history].slice(0, 100);
      setHistory(list);
      localStorage.setItem("vizor.web.rides", JSON.stringify(list));
      if (!demo && supabase)
        void supabase.auth.getUser().then(({ data: { user } }) => {
          if (user)
            void supabase!.from("ride_sessions").insert({
              user_id: user.id,
              started_at: new Date(record.startedAt).toISOString(),
              ended_at: new Date(record.endedAt).toISOString(),
              destination: record.destination,
              distance_m: record.distance,
            });
        });
      startedAt.current = 0;
    }
  };
  const start = () =>
    run(async () => {
      if (!route) throw new Error("Choose a destination first.");
      if (!demo) {
        await getPosition();
        watch.current = navigator.geolocation.watchPosition(
          (p) => {
            if ((p.coords.accuracy ?? Infinity) <= 50)
              setPosition({ lat: p.coords.latitude, lon: p.coords.longitude });
          },
          () =>
            setError("Location tracking stopped. Check permission and GPS."),
          { enableHighAccuracy: true, maximumAge: 1000 },
        );
      } else setReplaying(true);
      nextStep.current = 1;
      announced.current.clear();
      startedAt.current = Date.now();
      travelled.current = 0;
      lastPosition.current = position;
      setActive(true);
      speak("Navigation started.");
    });
  const executeReply = async (answer: AssistantReply) => {
    setReply(
      `${answer.transcript ? "You: " + answer.transcript + " — " : ""}${answer.message}`,
    );
    speak(answer.message);
    if (answer.action === "navigate") {
      setQuery(answer.destination!);
      if (!demo)
        setPlaces(await api<Place[]>("places", { query: answer.destination! }));
    }
    if (answer.action === "repeat")
      speak(
        route?.steps[progress?.nextStepIndex || 1]?.instruction ||
          "No active navigation.",
      );
    if (answer.action === "mute") setMuted(true);
    if (answer.action === "unmute") setMuted(false);
    if (answer.action === "cancel") stop();
    if (answer.action === "report") {
      if (demo) {
        setReply("Demo report preview. No live record was created.");
        return;
      }
      const point = await getPosition();
      await queueObservation({
        eventId: crypto.randomUUID(),
        source: "manual",
        observedAt: new Date().toISOString(),
        location: point,
        accuracyMeters: fixAccuracy.current,
        confidence: null,
      });
      await syncObservations();
      setPending(pendingObservations());
      setReply(
        "Report saved as a suspected observation with the reported GPS accuracy.",
      );
    }
  };
  const ask = (audio?: string, mimeType?: string) =>
    run(async () => {
      if (demo) {
        setReply(
          "The live Gemini assistant needs your service setup. This dashboard is an illustrative replay; no AI response has been fabricated.",
        );
        return;
      }
      request.current = new AbortController();
      const answer = await api<AssistantReply>(
        "assistant",
        {
          text: message,
          audio,
          mimeType,
          context: {
            destination: destination.current?.name,
            upcomingHazards:
              route && position
                ? upcomingHazards(route.geometry, position, potholes).length
                : null,
            helmet: telemetry,
          },
        },
        request.current.signal,
      );
      await executeReply(validateReply(answer));
      setMessage("");
    });
  const record = async () => {
    if (listening) {
      media.current?.stop();
      return;
    }
    setError("");
    try {
      cancelRecording.current = false;
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(stream.current);
      media.current = recorder;
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        setListening(false);
        if (timer.current) clearTimeout(timer.current);
        stream.current?.getTracks().forEach((t) => t.stop());
        if (cancelRecording.current) return;
        const reader = new FileReader();
        reader.onload = () =>
          void ask(
            String(reader.result).split(",")[1],
            recorder.mimeType.split(";")[0],
          );
        reader.readAsDataURL(new Blob(chunks, { type: recorder.mimeType }));
      };
      recorder.start();
      setListening(true);
      timer.current = setTimeout(() => recorder.stop(), 20000);
    } catch {
      setError(
        "Microphone access was denied or recording is unavailable. You can type your request.",
      );
    }
  };
  const report = (verdict: string) =>
    run(async () => {
      if (!selected) return;
      if (demo) {
        setReply("Demo report preview. Live records were not changed.");
        return;
      }
      await api("report", { id: selected.id, verdict });
      setReply(
        "Your report was recorded. Repair status requires corroboration.",
      );
    });
  const visible = potholes.filter(
    (p) =>
      filter === "all" ||
      (filter === "active"
        ? p.status !== "repaired"
        : p.status === "corroborated"),
  );
  return (
    <div className="app-shell">
      <div className="dashboard">
        <aside className="dashboard-sidebar">
          <div className="dashboard-heading">
            YOUR CO-PILOT{" "}
            <span className="demo-tag">{demo ? "DEMO" : "LIVE SERVICES"}</span>
          </div>
          <div className="destination-panel">
            <label htmlFor="destination">Where are you heading?</label>
            <form
              className="search-form"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void search();
              }}
            >
              <input
                id="destination"
                placeholder="VIT or Katpadi bus stand"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                minLength={2}
              />
              {query && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Clear destination search"
                  onClick={() => {
                    setQuery("");
                    setPlaces([]);
                    document.getElementById("destination")?.focus();
                  }}
                >
                  <X size={15} />
                </button>
              )}
              <button
                className="icon-button"
                aria-label="Search destination"
                disabled={busy || query.length < 2}
              >
                <Search size={17} />
              </button>
            </form>
            <p className="info-note">
              {demo
                ? "Katpadi sample landmarks · or click a road on the map."
                : "Google Places search · or click a road on the map."}
            </p>
            <div className="place-results">
              {places.map((p) => (
                <button key={p.id} onClick={() => void choose(p)}>
                  {p.name}
                  <small>{p.address}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="route-options">
            <div className="mini-heading">YOUR ROUTE</div>
            {routes.length ? (
              routes.map((r, i) => (
                <button
                  key={i}
                  className={`route-card ${routeIndex === i ? "active" : ""}`}
                  onClick={() => {
                    if (active) stop();
                    setRouteIndex(i);
                    nextStep.current = 1;
                  }}
                >
                  <strong>
                    {Math.ceil(r.duration / 60)} <span>min</span>
                  </strong>
                  <span> / {(r.distance / 1000).toFixed(1)} km</span>
                  <p>
                    {routeHazards(r.geometry, potholes).length} reported hazards
                    on route
                  </p>
                </button>
              ))
            ) : (
              <p className="info-note">
                Search for a place or select a destination on the live map.
              </p>
            )}
            {active ? (
              <button className="primary-button" onClick={stop}>
                End journey <Square size={13} />
              </button>
            ) : (
              <button
                className="primary-button"
                disabled={busy || !route}
                onClick={() => void start()}
              >
                {" "}
                {demo ? "Replay the journey" : "Start navigation"}{" "}
                <ArrowUpRight size={17} />
              </button>
            )}
            {active && (
              <div className="ride-active">
                <span className="live-dot" />
                {demo ? "ILLUSTRATIVE REPLAY" : "NAVIGATION ACTIVE"}
              </div>
            )}
          </div>
          <div className="sidebar-bottom">
            <div className="status-card">
              <div>
                <span>
                  <Bluetooth size={13} /> Helmet
                </span>
                <strong>{demo ? "Demo preview" : "Phone app link"}</strong>
              </div>
              <div>
                <span>Battery</span>
                <strong>
                  {telemetry?.battery_percent != null
                    ? `${telemetry.battery_percent}%`
                    : "Unavailable"}
                </strong>
              </div>
              <div>
                <span>Camera</span>
                <strong>
                  {telemetry?.camera &&
                  Date.now() - Date.parse(telemetry.recorded_at) < 60000
                    ? "Streaming"
                    : "No live feed"}
                </strong>
              </div>
              <small>
                BLE pairing and helmet controls are available in the Android
                app.
              </small>
            </div>
            <Link className="text-link" to={demo ? "/login" : "/account"}>
              <User size={14} />
              {demo ? "Sign in for live services" : "Profile & devices"}
              <ArrowUpRight size={15} />
            </Link>
          </div>
          {pending > 0 && (
            <p className="info-note">
              {pending} observation(s) waiting to sync.
            </p>
          )}
          {error && (
            <p role="alert" className="error-note">
              {error}
            </p>
          )}
        </aside>
        <section className="dashboard-main">
          <div className="dashboard-toolbar">
            <h1>Road intelligence.</h1>
            <div>
              <Link className="filter-button" to="/lab">Photo demo ↗</Link>
              <button
                className="filter-button"
                onClick={() => void reportHere()}
              >
                Report here
              </button>
              {!demo && (
                <button
                  className={`filter-button ${recorded ? "active" : ""}`}
                  aria-pressed={recorded}
                  onClick={() => {
                    setRecorded(!recorded);
                    setPotholes([]);
                    setSelected(null);
                    if (position)
                      void api<Pothole[]>("map", {
                        bounds: {
                          south: position.lat - 0.04,
                          north: position.lat + 0.04,
                          west: position.lon - 0.04,
                          east: position.lon + 0.04,
                        },
                        replay: !recorded,
                      })
                        .then(setPotholes)
                        .catch((e) => setError(e.message));
                  }}
                >
                  Recorded replay
                </button>
              )}
              {[
                ["all", "All reports"],
                ["active", "Active"],
                ["verified", "Corroborated"],
              ].map(([v, l]) => (
                <button
                  key={v}
                  className={`filter-button ${filter === v ? "active" : ""}`}
                  aria-pressed={filter === v}
                  onClick={() => setFilter(v)}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="map-wrap">
            <RoadMap
              demo={demo}
              potholes={visible}
              route={route?.geometry || []}
              position={position}
              destination={destination.current?.location}
              onSelect={setSelected}
              onDestination={(p) =>
                void choose({
                  id: "pin",
                  name: "Selected destination",
                  address: "Map pin",
                  location: p,
                })
              }
              onBounds={bounds}
            />
            <div className="map-stat">
              <span>
                {demo
                  ? "KATPADI · SAMPLE HAZARDS"
                  : recorded
                    ? "RECORDED REPLAY"
                    : "VISIBLE MAP AREA"}
              </span>
              <strong>{visible.length.toString().padStart(2, "0")}</strong>
              <p>
                Reported road hazards.
                <br />A shared memory for the road.
              </p>
            </div>
            {demo && (
              <div className="map-controls">
                <button
                  disabled={busy}
                  onClick={() => {
                    if (replaying) setReplaying(false);
                    else if (active) setReplaying(true);
                    else void start();
                  }}
                >
                  {replaying ? <Pause size={13} /> : <Play size={13} />}{" "}
                  {replaying ? "Pause" : "Play"} replay
                </button>
                <button
                  onClick={() => {
                    setReplaying(false);
                    if (active) stop();
                    setPosition(DEMO_START);
                    setRoutes([DEMO_ROUTE]);
                    setRouteIndex(0);
                    destination.current = KATPADI_PLACES[1];
                    setQuery("");
                    nextStep.current = 1;
                  }}
                >
                  Reset
                </button>
              </div>
            )}
            <div className="map-caption">
              {demo
                ? "KATPADI · SCRIPTED RIDE & SAMPLE HAZARDS · NOT LIVE ROAD DATA"
                : recorded
                  ? "RECORDED DETECTIONS · REPLAY LOCATIONS ARE NOT LIVE REPORTS"
                  : "OPENSTREETMAP · PROJECT HAZARDS ARE APPROXIMATE OBSERVATIONS"}
            </div>
            {selected && (
              <aside className="hazard-drawer" aria-label="Hazard details">
                <div className="drawer-title">
                  <h2>Road observation</h2>
                  <button
                    aria-label="Close hazard details"
                    onClick={() => setSelected(null)}
                  >
                    <X size={19} />
                  </button>
                </div>
                <span className="demo-tag">
                  {selected.status.toUpperCase()}
                </span>
                <p>
                  {demo
                    ? "Sample record illustrating how sightings become shared road knowledge."
                    : "An approximate hazard location, supported by rider observations."}
                </p>
                <div className="hazard-meta">
                  <div>
                    <span>Sightings</span>
                    <strong>{selected.sightings}</strong>
                  </div>
                  <div>
                    <span>Location uncertainty</span>
                    <strong>±{selected.uncertainty_m} m</strong>
                  </div>
                  <div>
                    <span>Last seen</span>
                    <strong>
                      {new Date(selected.last_seen).toLocaleDateString()}
                    </strong>
                  </div>
                  <div>
                    <span>Coordinates</span>
                    <strong>
                      {selected.lat.toFixed(5)}, {selected.lon.toFixed(5)}
                    </strong>
                  </div>
                </div>
                <div className="private-evidence">
                  {evidence.length ? (
                    <>
                      <h3>Your private evidence</h3>
                      {evidence.map((e, i) => (
                        <figure key={i}>
                          {e.url && (
                            <img
                              src={e.url}
                              alt="Privately uploaded road observation"
                            />
                          )}
                          <figcaption>
                            {e.source} ·{" "}
                            {e.confidence == null
                              ? "Confidence unavailable"
                              : `${Math.round(e.confidence * 100)}% confidence`}
                            <br />
                            {e.model_revision || "No vision model"}
                          </figcaption>
                        </figure>
                      ))}
                    </>
                  ) : (
                    !demo && (
                      <p>
                        Raw evidence is private. No evidence owned by this
                        account is available for this record.
                      </p>
                    )
                  )}
                </div>
                <div className="hazard-actions">
                  <button
                    disabled={recorded}
                    onClick={() => void report("present")}
                  >
                    Still present
                  </button>
                  <button
                    disabled={recorded}
                    onClick={() => void report("repaired")}
                  >
                    Looks repaired
                  </button>
                  <button
                    disabled={recorded}
                    onClick={() => void report("incorrect")}
                  >
                    Dispute
                  </button>
                </div>
              </aside>
            )}
          </div>
          <div className="dashboard-bottom">
            <div>
              <div className="mini-heading">
                {active ? "YOUR NEXT MANEUVER" : "JOURNEY PREVIEW"}
              </div>
              <div className="journey-step">
                {progress?.direction === 1 ? (
                  <ArrowLeft />
                ) : progress?.direction === 2 ? (
                  <ArrowRight />
                ) : (
                  <ArrowUp />
                )}
                <div>
                  <strong>
                    {progress
                      ? `${Math.round(progress.distanceToManeuver)} m`
                      : "Choose a route"}
                  </strong>
                  <p>
                    {route?.steps[progress?.nextStepIndex || 1]?.instruction ||
                      "Directions will appear here."}
                  </p>
                </div>
              </div>
              {demo && (
                <p className="assistant-result">
                  Replay is scripted; potholes are samples. The embedded map
                  uses Google Maps when configured.
                </p>
              )}
            </div>
            <div>
              <div className="mini-heading">
                <Mic size={13} /> ASK VIZOR{" "}
                <span className="demo-tag">PUSH TO TALK</span>
              </div>
              <form
                className="assistant-input"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  void ask();
                }}
              >
                <input
                  aria-label="Ask Vizor"
                  placeholder="What’s ahead on my route?"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={
                    listening ? "Stop recording" : "Start voice recording"
                  }
                  onClick={() => void record()}
                  disabled={busy}
                >
                  {listening ? <Square size={15} /> : <Mic size={15} />}
                </button>
                <button
                  className="icon-button"
                  aria-label="Send message"
                  disabled={busy || !message.trim()}
                >
                  <Send size={15} />
                </button>
                {listening && (
                  <button
                    type="button"
                    className="filter-button"
                    onClick={() => {
                      cancelRecording.current = true;
                      media.current?.stop();
                    }}
                  >
                    Discard
                  </button>
                )}
                {busy && (
                  <button
                    type="button"
                    className="filter-button"
                    onClick={() => request.current?.abort()}
                  >
                    Cancel
                  </button>
                )}
              </form>
              <div role="status" className="assistant-result">
                {listening
                  ? "Listening… tap stop when finished."
                  : busy
                    ? "Working…"
                    : reply ||
                      "Ask about your route, report a hazard, or repeat a direction."}
              </div>
              <button
                className="filter-button"
                onClick={() => {
                  setMuted(!muted);
                  speechSynthesis?.cancel();
                }}
              >
                <Volume2 size={12} /> {muted ? "Enable speech" : "Mute speech"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
