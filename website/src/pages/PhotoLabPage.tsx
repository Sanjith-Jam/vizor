import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Cpu,
  Database,
  ImagePlus,
  MapPin,
  RefreshCw,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import { supabase } from "../lib/supabase";
import { RoadMap } from "../components/RoadMap";
import { KATPADI_CENTER, KATPADI_BOUNDS } from "../../../shared/katpadi";
import {
  inferenceMarkers,
  workerOnline,
  validPoint,
  photoDemoAlert,
  type InferenceState,
  type InferenceJob,
  type Pothole,
} from "../../../shared/contracts";

const empty: InferenceState = {
  devices: [],
  jobs: [],
  telemetry: [],
  observations: [],
};
export function PhotoLabPage() {
  const [data, setData] = useState(empty),
    [deviceId, setDeviceId] = useState("");
  const [photo, setPhoto] = useState<{
    image: string;
    name: string;
    sample: boolean;
  } | null>(null);
  const [mode, setMode] = useState<"demo" | "report">("demo"),
    [confirmed, setConfirmed] = useState(false);
  const [lat, setLat] = useState(String(KATPADI_CENTER.lat)),
    [lon, setLon] = useState(String(KATPADI_CENTER.lon));
  const [mapOpen, setMapOpen] = useState(false),
    [selectedId, setSelectedId] = useState("");
  const [liveHazards, setLiveHazards] = useState<Pothole[]>([]);
  const [imageUrl, setImageUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [preparing, setPreparing] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [sync, setSync] = useState("Connecting");
  const [now, setNow] = useState(Date.now());
  const [warning, setWarning] = useState("");
  const uploadId = useRef<string | null>(null),
    upload = useRef<AbortController | null>(null);
  const alive = useRef(true),
    file = useRef<HTMLInputElement>(null);
  const selected = data.jobs.find((j) => j.id === selectedId) || data.jobs[0];
  const device = data.devices.find((d) => d.id === deviceId);
  const point = { lat: Number(lat), lon: Number(lon) };
  const refresh = useCallback(async () => {
    try {
      const result = await api<InferenceState>("inferenceState");
      if (!alive.current) return;
      setData(result);
      setNow(Date.now());
      setDeviceId((id) =>
        result.devices.some((d) => d.id === id)
          ? id
          : result.devices[0]?.id || "",
      );
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    void refresh();
    let timer: ReturnType<typeof setTimeout>;
    const changed = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 300);
    };
    const channel = supabase!
      .channel("photo-lab-web")
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
        setSync(
          status === "SUBSCRIBED"
            ? "Live sync"
            : status === "CHANNEL_ERROR" || status === "TIMED_OUT"
              ? "Connection interrupted"
              : "Connecting",
        );
        if (status === "SUBSCRIBED") void refresh();
      });
    const online = () => void refresh();
    window.addEventListener("online", online);
    const clock = setInterval(() => setNow(Date.now()), 15000); // Local freshness clock; no map/API polling.
    return () => {
      alive.current = false;
      clearTimeout(timer);
      clearInterval(clock);
      upload.current?.abort();
      if ("speechSynthesis" in window) speechSynthesis.cancel();
      window.removeEventListener("online", online);
      void supabase!.removeChannel(channel);
    };
  }, [refresh]);
  const path = selected?.result?.annotatedPath || selected?.evidence_path;
  useEffect(() => {
    let stale = false;
    setImageUrl("");
    if (path)
      void api<{ signedUrl: string }>("evidence", { path })
        .then((r) => {
          if (!stale) setImageUrl(r.signedUrl);
        })
        .catch((e) => {
          if (!stale) setError(e.message);
        });
    return () => {
      stale = true;
    };
  }, [path]);
  useEffect(() => {
    uploadId.current = null;
  }, [photo, deviceId, lat, lon, mode, confirmed]);
  useEffect(() => {
    if (!mapOpen || mode !== "report") return;
    let stale = false;
    void api<Pothole[]>("map", { bounds: KATPADI_BOUNDS })
      .then((r) => {
        if (!stale) setLiveHazards(r);
      })
      .catch((e) => {
        if (!stale) setError(e.message);
      });
    return () => {
      stale = true;
    };
  }, [mapOpen, mode, data.jobs]);
  const choose = async (candidate?: File, sample = false) => {
    if (!candidate) return;
    setPreparing(true);
    setError("");
    try {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(candidate.type) ||
        !candidate.size ||
        candidate.size > 10_000_000
      )
        throw new Error("Choose a JPG, PNG or WebP photo smaller than 10 MB.");
      const bitmap = await createImageBitmap(candidate);
      try {
        if (bitmap.width * bitmap.height > 24_000_000)
          throw new Error("Choose a photo below 24 megapixels.");
        const ratio = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bitmap.width * ratio);
        canvas.height = Math.round(bitmap.height * ratio);
        canvas
          .getContext("2d")!
          .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const image = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
        if (image.length > 6_600_000)
          throw new Error(
            "This image is too large after resizing. Choose a smaller photo.",
          );
        setPhoto({ name: candidate.name, image, sample });
        if (sample) {
          setMode("demo");
          setConfirmed(false);
        }
      } finally {
        bitmap.close();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreparing(false);
      if (file.current) file.current.value = "";
    }
  };
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    setNotice("");
    if (
      !photo ||
      !deviceId ||
      !lat.trim() ||
      !lon.trim() ||
      !validPoint(point) ||
      (mode === "report" && !confirmed)
    ) {
      setError(
        "Choose a photo, your Banana Pi and a valid location. Confirm actual locations before reporting.",
      );
      return;
    }
    setBusy(true);
    upload.current = new AbortController();
    uploadId.current ||= crypto.randomUUID();
    try {
      const job = await api<InferenceJob>(
        "createInference",
        {
          id: uploadId.current,
          deviceId,
          location: point,
          image: photo.image,
          mode,
          locationConfirmed: confirmed,
        },
        upload.current.signal,
      );
      if (!alive.current) return;
      setSelectedId(job.id);
      setPhoto(null);
      setNotice(
        "Photo queued. Your Banana Pi will process it when its worker connects.",
      );
      await refresh();
    } catch (e) {
      if (alive.current)
        setError(
          (e as Error).name === "AbortError"
            ? "Upload request stopped. Check recent uploads before retrying; retries use the same job ID."
            : (e as Error).message,
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const jobAction = async (action: string, job: InferenceJob) => {
    setError("");
    try {
      await api(action, { id: job.id });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const markers =
    mode === "demo" ? inferenceMarkers(data.jobs, "demo") : liveHazards;
  useEffect(() => {
    setWarning("");
    if ("speechSynthesis" in window) speechSynthesis.cancel();
  }, [selected?.id]);
  return (
    <section className="photo-lab">
      <div className="lab-heading">
        <div>
          <span className="eyebrow">VIZOR / CONNECTED PHOTO DEMO</span>
          <h1>
            FROM ROAD
            <br />
            TO RECORD.
          </h1>
          <p>
            A real photograph. Your Banana Pi. One shared result across web and
            app.
          </p>
        </div>
        <div className="lab-heading-actions">
          <span className="lab-sync" role="status">
            {sync}
          </span>
          <button className="secondary-button" onClick={() => void refresh()}>
            <RefreshCw size={16} /> Refresh
          </button>
          <Link to="/dashboard">
            Rider dashboard <ArrowUpRight size={16} />
          </Link>
        </div>
      </div>
      <ol className="lab-pipeline" aria-label="Photo inference pipeline">
        {[
          "Upload photo",
          "Banana Pi inference",
          "Private database",
          "Map & companion app",
        ].map((label, i) => (
          <li key={label}>
            <span>0{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      {error && (
        <div className="error-note" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="info-note" role="status">
          {notice}
        </div>
      )}
      <div className="lab-grid">
        <form className="lab-panel lab-form" noValidate onSubmit={send}>
          <div className="lab-section-label">
            <ImagePlus size={18} /> PHOTO INPUT
          </div>
          <h2>Let the road speak.</h2>
          <label className="lab-upload">
            {photo ? (
              <img
                src={`data:image/jpeg;base64,${photo.image}`}
                alt="Selected road photo"
              />
            ) : (
              <>
                <ImagePlus size={34} />
                <strong>
                  {preparing ? "Preparing photo…" : "Choose a road photo"}
                </strong>
                <span>JPG, PNG, WebP · up to 10 MB</span>
              </>
            )}
            <input
              ref={file}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Choose road photo"
              disabled={busy || preparing}
              onChange={(e) => void choose(e.target.files?.[0])}
            />
          </label>
          <button
            type="button"
            className="secondary-button"
            disabled={busy || preparing}
            onClick={() =>
              void fetch("/images/rdd2022-india-sample.jpg")
                .then((r) => {
                  if (!r.ok) throw new Error("Demo photo could not load.");
                  return r.blob();
                })
                .then((blob) =>
                  choose(
                    new File([blob], "RDD2022 India sample.jpg", {
                      type: "image/jpeg",
                    }),
                    true,
                  ),
                )
                .catch((e) => setError(e.message))
            }
          >
            Use demo road photo
          </button>
          <a
            className="lab-help"
            href="/images/rdd2022-NOTICE.txt"
            target="_blank"
            rel="noreferrer"
          >
            Demo photo: RDD2022 / Arya et al. · CC BY-SA 4.0
          </a>
          {photo && (
            <div className="lab-file">
              <span>{photo.name}</span>
              <button
                type="button"
                aria-label="Remove selected photo"
                disabled={busy}
                onClick={() => setPhoto(null)}
              >
                <X size={18} />
              </button>
            </div>
          )}
          <label>
            Banana Pi
            <select
              value={deviceId}
              disabled={busy}
              onChange={(e) => setDeviceId(e.target.value)}
            >
              <option value="">Choose a registered device</option>
              {data.devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <div
            className={`lab-device ${workerOnline(device, now) ? "is-online" : ""}`}
          >
            <Cpu size={19} />
            <div>
              <strong>
                {workerOnline(device, now)
                  ? "Photo worker connected"
                  : "Waiting for photo worker"}
              </strong>
              <small>
                {device?.worker_seen_at
                  ? `Last seen ${new Date(device.worker_seen_at).toLocaleTimeString()}`
                  : "The photo stays queued while the Pi is offline."}
              </small>
            </div>
          </div>
          {!data.devices.length && (
            <Link to="/account">
              Register your Banana Pi in your account <ArrowUpRight size={14} />
            </Link>
          )}
          <fieldset disabled={busy}>
            <legend>Where should the result appear?</legend>
            <div className="lab-segment">
              <button
                type="button"
                aria-pressed={mode === "demo"}
                onClick={() => {
                  setMode("demo");
                  setConfirmed(false);
                }}
              >
                Demo layer
              </button>
              <button
                type="button"
                disabled={photo?.sample}
                aria-pressed={mode === "report"}
                onClick={() => setMode("report")}
              >
                Real road report
              </button>
            </div>
            <p className="lab-help">
              {mode === "demo"
                ? "The selected point is illustrative. Demo results stay private and never enter the shared road database."
                : "Place the pin where this photograph was taken. A detection creates an approximate, suspected report."}
            </p>
            <div className="lab-coordinates">
              <label>
                Latitude
                <input
                  inputMode="decimal"
                  value={lat}
                  onChange={(e) => {
                    setLat(e.target.value);
                    setConfirmed(false);
                  }}
                />
              </label>
              <label>
                Longitude
                <input
                  inputMode="decimal"
                  value={lon}
                  onChange={(e) => {
                    setLon(e.target.value);
                    setConfirmed(false);
                  }}
                />
              </label>
            </div>
            {mode === "report" && (
              <label className="lab-confirm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I confirm this is the photo’s actual location.
              </label>
            )}
          </fieldset>
          <button
            className="primary-button"
            disabled={busy || preparing || !photo || !deviceId}
            type="submit"
          >
            {busy ? "Uploading photo…" : "Send to Banana Pi"}
            <ArrowUpRight size={18} />
          </button>
          {busy && (
            <button
              type="button"
              className="text-link"
              onClick={() => upload.current?.abort()}
            >
              Stop upload request
            </button>
          )}
          <p className="lab-help">
            Photos are resized and stripped of location metadata before upload.
            The model filters potholes only; cracks do not become alerts.
          </p>
        </form>
        <div className="lab-results">
          <div className="lab-panel">
            <div className="lab-section-label">
              <Cpu size={18} /> DEVICE OUTPUT
            </div>
            <div className="lab-result-heading">
              <h2>
                {selected?.status === "completed"
                  ? `${selected.result?.detections.length || 0} pothole${selected.result?.detections.length === 1 ? "" : "s"} detected.`
                  : selected
                    ? `${selected.status[0].toUpperCase() + selected.status.slice(1)}.`
                    : "Ready for your first photo."}
              </h2>
              {selected && (
                <span className="lab-mode">
                  {selected.mode === "demo"
                    ? "DEMO LOCATION"
                    : "ACTUAL PHOTO LOCATION"}
                </span>
              )}
            </div>
            <div className="lab-result-image">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt="Private road photo with Banana Pi pothole findings when complete"
                  onError={() => {
                    setImageUrl("");
                    setError(
                      "Image link expired. Select another upload and return, or reload this page for a fresh link.",
                    );
                  }}
                />
              ) : (
                <div>
                  <Cpu size={40} />
                  <p>
                    {selected
                      ? "Loading private evidence…"
                      : "Bounding boxes and confidence arrive from the Pi after inference."}
                  </p>
                </div>
              )}
            </div>
            {selected?.result && (
              <div className="lab-metrics">
                <div>
                  <strong>{Math.round(selected.result.inferenceMs)} ms</strong>
                  <span>Measured inference</span>
                </div>
                <div>
                  <strong>
                    {selected.result.detections.length
                      ? Math.round(
                          Math.max(
                            ...selected.result.detections.map(
                              (d) => d.confidence,
                            ),
                          ) * 100,
                        ) + "%"
                      : "—"}
                  </strong>
                  <span>Highest confidence</span>
                </div>
                <div>
                  <strong>Nano / 640</strong>
                  <span>Pothole class only</span>
                </div>
              </div>
            )}
            {selected && (
              <p className="lab-help">
                {selected.error ||
                  (selected.status === "queued"
                    ? "Saved in the cloud queue. Keep the Banana Pi powered with its photo worker running."
                    : selected.status === "processing"
                      ? "The Banana Pi has claimed this photo. Results will update automatically."
                      : selected.result
                        ? selected.result.detections.length
                          ? "A map point represents the approximate photo location, not a separate GPS fix for each bounding box."
                          : "No pothole crossed the model’s confidence threshold. No map point was created."
                        : "This upload is no longer processing.")}
              </p>
            )}
            {selected?.result && (
              <details className="lab-details">
                <summary>Detection details & model revision</summary>
                <code>{selected.result.modelRevision}</code>
                {selected.result.detections.map((d, i) => (
                  <p key={i}>
                    Pothole {i + 1}: {Math.round(d.confidence * 100)}% ·
                    normalized box {d.bbox.map((v) => v.toFixed(3)).join(", ")}
                  </p>
                ))}
              </details>
            )}
            {photoDemoAlert(selected) && (
              <div className="lab-warning-preview">
                <button
                  className="secondary-button"
                  onClick={() => {
                    const text = photoDemoAlert(selected)!;
                    setWarning(text);
                    if ("speechSynthesis" in window) {
                      speechSynthesis.cancel();
                      speechSynthesis.speak(new SpeechSynthesisUtterance(text));
                    }
                  }}
                >
                  Preview pothole warning
                </button>
                <p className="lab-help">
                  Uses this detection with scripted distances. No real ride or
                  helmet command is sent.
                </p>
                {warning && (
                  <>
                    <div className="lab-hud" role="status">
                      <div>
                        <strong>↰</strong>
                        <span>
                          LEFT
                          <br />
                          <b>120 m</b>
                        </span>
                      </div>
                      <p>POTHOLE · 50 m</p>
                      <small>SOFTWARE HUD PREVIEW · SCRIPTED DISTANCES</small>
                    </div>
                    <button
                      className="text-link"
                      onClick={() => {
                        setWarning("");
                        if ("speechSynthesis" in window)
                          speechSynthesis.cancel();
                      }}
                    >
                      Stop warning preview
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="lab-panel">
            <div className="lab-section-label">
              <MapPin size={18} />{" "}
              {mode === "demo" ? "PRIVATE DEMO MAP" : "SHARED ROAD MAP"}
            </div>
            <div className="lab-map-heading">
              <h2>Put it on the map.</h2>
              <button
                className="secondary-button"
                onClick={() => setMapOpen((v) => !v)}
              >
                {mapOpen ? "Close map" : "Open Google Maps"}
              </button>
            </div>
            {mapOpen ? (
              <div className="lab-map map-wrap">
                <RoadMap
                  demo={mode === "demo"}
                  potholes={markers}
                  route={[]}
                  position={null}
                  destination={validPoint(point) ? point : null}
                  onDestination={(p) => {
                    setLat(p.lat.toFixed(6));
                    setLon(p.lon.toFixed(6));
                    setConfirmed(false);
                  }}
                  onSelect={(p) => setSelectedId(p.id)}
                  onBounds={() => {}}
                />
              </div>
            ) : (
              <p className="lab-help">
                Open the map to choose a photo location and see completed
                detections. Google Maps loads only when opened.
              </p>
            )}
            <p className="lab-help">
              {mode === "demo"
                ? "Private demo points come from real inference at illustrative locations."
                : "Shared reports are approximate candidates and need independent confirmation."}{" "}
              Click a road to move the upload pin.
            </p>
          </div>
        </div>
      </div>
      <div className="lab-panel lab-activity">
        <div className="lab-section-label">
          <Database size={18} /> LIVE DATABASE ACTIVITY
        </div>
        <h2>One record. Every screen.</h2>
        <p>
          These are your actual database rows, delivered through the same
          authenticated backend used by the app.
        </p>
        <div className="lab-job-list">
          {data.jobs.length ? (
            data.jobs.map((j) => (
              <div
                className={`lab-job ${selected?.id === j.id ? "is-selected" : ""}`}
                key={j.id}
              >
                <button onClick={() => setSelectedId(j.id)}>
                  <strong>
                    {j.status} · {j.mode === "demo" ? "Demo" : "Road report"}
                  </strong>
                  <span>
                    {new Date(j.created_at).toLocaleString()} ·{" "}
                    {j.result?.detections.length ?? "—"} potholes
                  </span>
                  <code>{j.id}</code>
                </button>
                {["queued", "processing"].includes(j.status) && (
                  <button
                    className="text-link"
                    onClick={() => void jobAction("cancelInference", j)}
                  >
                    Cancel job
                  </button>
                )}
                {["failed", "cancelled"].includes(j.status) && (
                  <button
                    className="text-link"
                    onClick={() => void jobAction("retryInference", j)}
                  >
                    Retry
                  </button>
                )}
              </div>
            ))
          ) : (
            <div className="lab-empty">
              Your uploads will appear here. The app will see the same job IDs
              and statuses.
            </div>
          )}
        </div>
        <div className="lab-table-scroll">
          <table>
            <caption>Latest private observations</caption>
            <thead>
              <tr>
                <th>Event</th>
                <th>Source</th>
                <th>Position</th>
                <th>Confidence</th>
                <th>Shared record</th>
              </tr>
            </thead>
            <tbody>
              {data.observations.map((o) => (
                <tr key={o.id}>
                  <td>
                    <code>{o.event_id}</code>
                    <small>{new Date(o.observed_at).toLocaleString()}</small>
                  </td>
                  <td>{o.source === "replay" ? "Demo / replay" : o.source}</td>
                  <td>
                    {o.lat == null
                      ? "No location"
                      : `${o.lat.toFixed(5)}, ${o.lon!.toFixed(5)}`}
                  </td>
                  <td>
                    {o.confidence == null
                      ? "—"
                      : Math.round(o.confidence * 100) + "%"}
                  </td>
                  <td>
                    {o.pothole_id ? (
                      <code>{o.pothole_id.slice(0, 8)}…</code>
                    ) : (
                      "Not published"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.observations.length && (
            <p>
              No observation rows yet. A completed detection creates one photo
              observation.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
