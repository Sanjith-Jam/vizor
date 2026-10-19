import React, { useEffect, useRef, useState } from "react";
import { Image, Platform, StyleSheet, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as Crypto from "expo-crypto";
import { Asset } from "expo-asset";
import * as Speech from "expo-speech";
import { HudPreview } from "../components/HudPreview";
import { NavigationDirection } from "../protocol/navigationProtocol";
import {
  AppText,
  Button,
  Card,
  Entrance,
  Screen,
  SectionTitle,
} from "../components/ui";
import { MapCanvas } from "../components/MapCanvas";
import { usePhotoJobs } from "../cloud/usePhotoJobs";
import { cloudApi } from "../cloud/client";
import {
  inferenceMarkers,
  workerOnline,
  validPoint,
  photoDemoAlert,
  type InferenceJob,
  type Pothole,
} from "../../../shared/contracts";
import {
  KATPADI_CENTER,
  KATPADI_BOUNDS,
  KATPADI_PLACES,
} from "../../../shared/katpadi";
import { colors, fonts, radius, spacing } from "../theme";

export default function LiveDemo() {
  const router = useRouter();
  const { data, error, setError, sync, refresh, now, session } = usePhotoJobs();
  const [photo, setPhoto] = useState<{
    image: string;
    uri: string;
    name: string;
    sample: boolean;
  } | null>(null);
  const [deviceId, setDeviceId] = useState(""),
    [selectedId, setSelectedId] = useState("");
  const [mode, setMode] = useState<"demo" | "report">("demo"),
    [confirmed, setConfirmed] = useState(false);
  const [lat, setLat] = useState(String(KATPADI_CENTER.lat)),
    [lon, setLon] = useState(String(KATPADI_CENTER.lon));
  const [busy, setBusy] = useState(false),
    [preparing, setPreparing] = useState(false),
    [notice, setNotice] = useState("");
  const [url, setUrl] = useState(""),
    [mapOpen, setMapOpen] = useState(false),
    [rowsOpen, setRowsOpen] = useState(false);
  const [liveHazards, setLiveHazards] = useState<Pothole[]>([]);
  const [warning, setWarning] = useState("");
  const uploadId = useRef<string | null>(null),
    request = useRef<AbortController | null>(null),
    alive = useRef(true);
  const device = data.devices.find((d) => d.id === deviceId),
    job = data.jobs.find((j) => j.id === selectedId) || data.jobs[0];
  const point = { lat: Number(lat), lon: Number(lon) };
  const evidence = job?.result?.annotatedPath || job?.evidence_path;
  useEffect(() => {
    setDeviceId((id) =>
      data.devices.some((d) => d.id === id) ? id : data.devices[0]?.id || "",
    );
  }, [data.devices]);
  useEffect(() => {
    uploadId.current = null;
  }, [photo, deviceId, mode, confirmed, lat, lon]);
  useEffect(() => {
    setSelectedId("");
    setUrl("");
  }, [session?.user.id]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      request.current?.abort();
      void Speech.stop();
    };
  }, []);
  useEffect(() => {
    setWarning("");
    void Speech.stop();
  }, [job?.id]);
  useEffect(() => {
    let stale = false;
    setUrl("");
    if (evidence && session)
      void cloudApi<{ signedUrl: string }>("evidence", { path: evidence })
        .then((r) => {
          if (!stale) setUrl(r.signedUrl);
        })
        .catch((e) => {
          if (!stale) setError(e.message);
        });
    return () => {
      stale = true;
    };
  }, [evidence, session?.user.id]);
  useEffect(() => {
    if (!mapOpen || mode !== "report" || !session) return;
    let stale = false;
    void cloudApi<Pothole[]>("map", { bounds: KATPADI_BOUNDS })
      .then((r) => {
        if (!stale) setLiveHazards(r);
      })
      .catch((e) => {
        if (!stale) setError(e.message);
      });
    return () => {
      stale = true;
    };
  }, [mapOpen, mode, data.jobs, session?.user.id]);
  const preparePhoto = async (
    source: {
      uri: string;
      width: number;
      height: number;
      fileSize?: number;
      fileName?: string | null;
    },
    sample = false,
  ) => {
    if (
      (source.fileSize || 0) > 10_000_000 ||
      source.width * source.height > 24_000_000
    )
      throw new Error("Choose a photo below 10 MB and 24 megapixels.");
    const context = ImageManipulator.manipulate(source.uri);
    const ratio = Math.min(1, 1280 / Math.max(source.width, source.height));
    if (ratio < 1)
      context.resize({
        width: Math.round(source.width * ratio),
        height: Math.round(source.height * ratio),
      });
    let rendered;
    try {
      rendered = await context.renderAsync();
      const normalized = await rendered.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.85,
        base64: true,
      });
      if (!normalized.base64 || normalized.base64.length > 6_600_000)
        throw new Error("Choose a smaller photo.");
      if (alive.current) {
        setPhoto({
          image: normalized.base64,
          uri: normalized.uri,
          name: source.fileName || "Road photo",
          sample,
        });
        if (sample) {
          setMode("demo");
          setConfirmed(false);
        }
      }
    } finally {
      rendered?.release();
      context.release();
    }
  };
  const choosePhoto = async (sample = false) => {
    if (preparing || busy) return;
    setPreparing(true);
    setError("");
    try {
      if (sample) {
        const asset = Asset.fromModule(
          require("../../assets/images/rdd2022-india-sample.jpg"),
        );
        await asset.downloadAsync();
        await preparePhoto(
          {
            uri: asset.localUri || asset.uri,
            width: asset.width || 640,
            height: asset.height || 640,
            fileName: "RDD2022 India sample",
          },
          true,
        );
        return;
      }
      const selected = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 1,
      });
      if (selected.canceled) return;
      await preparePhoto(selected.assets[0]);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setPreparing(false);
    }
  };
  const send = async () => {
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
        "Choose a photo, device and valid location. Confirm actual photo locations before reporting.",
      );
      return;
    }
    setBusy(true);
    request.current = new AbortController();
    uploadId.current ||= Crypto.randomUUID();
    try {
      const result = await cloudApi<InferenceJob>(
        "createInference",
        {
          id: uploadId.current,
          deviceId,
          image: photo.image,
          location: point,
          mode,
          locationConfirmed: confirmed,
        },
        request.current.signal,
      );
      if (!alive.current) return;
      setSelectedId(result.id);
      setPhoto(null);
      setNotice(
        "Photo queued. Your Banana Pi will process it when its worker connects.",
      );
      await refresh();
    } catch (e) {
      if (alive.current)
        setError(
          (e as Error).name === "AbortError"
            ? "Upload stopped. Check recent uploads before retrying; the same job ID prevents duplicates."
            : (e as Error).message,
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const jobAction = async (action: string, id: string) => {
    try {
      setError("");
      await cloudApi(action, { id });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Screen onRefresh={() => void refresh()}>
      <Button
        label="Back"
        variant="ghost"
        icon="arrow-back"
        onPress={() => router.back()}
      />
      <AppText variant="display" weight="bold">
        Road to record.
      </AppText>
      <AppText color={colors.textMuted}>
        Real Banana Pi findings, synced with your website.
      </AppText>
      <AppText variant="caption" weight="bold">
        {sync.toUpperCase()} · PHOTO DEMO
      </AppText>
      {!session ? (
        <Card>
          <AppText weight="bold">Connect your account</AppText>
          <AppText>
            Sign in with the same account on web and app to share uploads and
            findings.
          </AppText>
          <Button label="Sign in" onPress={() => router.push("/account")} />
        </Card>
      ) : (
        <>
          <Entrance>
            <Card style={styles.inputCard}>
              <AppText variant="heading">01 / Choose a road photo</AppText>
              {photo && (
                <>
                  <Image
                    source={{ uri: photo.uri }}
                    style={styles.photo}
                    resizeMode="contain"
                    accessibilityLabel="Selected road photo"
                  />
                  <AppText variant="small">{photo.name}</AppText>
                </>
              )}
              <Button
                label={photo ? "Choose a different photo" : "Choose photo"}
                icon="images-outline"
                loading={preparing}
                disabled={busy}
                variant="secondary"
                onPress={() => void choosePhoto()}
              />
              <Button
                compact
                label="Use demo road photo"
                disabled={busy || preparing}
                variant="secondary"
                onPress={() => void choosePhoto(true)}
              />
              <AppText variant="caption" color={colors.textMuted}>
                Demo photo: RDD2022 / Arya et al. · CC BY-SA 4.0
              </AppText>
              {photo && (
                <Button
                  compact
                  label="Remove photo"
                  variant="ghost"
                  disabled={busy}
                  onPress={() => setPhoto(null)}
                />
              )}
              <AppText variant="small" color={colors.textMuted}>
                Up to 10 MB. Resized JPEG uploads omit location metadata.
              </AppText>
              <AppText weight="bold">Send to your Banana Pi</AppText>
              {data.devices.map((d) => (
                <Button
                  compact
                  key={d.id}
                  label={`${d.name}${d.id === deviceId ? " · selected" : ""}`}
                  variant={d.id === deviceId ? "primary" : "secondary"}
                  disabled={busy}
                  onPress={() => setDeviceId(d.id)}
                />
              ))}
              {!data.devices.length && (
                <Button
                  label="Register Banana Pi"
                  variant="secondary"
                  onPress={() => router.push("/account")}
                />
              )}
              <View
                style={[
                  styles.device,
                  workerOnline(device, now) && styles.online,
                ]}
              >
                <AppText weight="bold">
                  {workerOnline(device, now)
                    ? "Photo worker connected"
                    : "Waiting for photo worker"}
                </AppText>
                <AppText variant="small">
                  {device?.worker_seen_at
                    ? `Last seen ${new Date(device.worker_seen_at).toLocaleTimeString()}`
                    : "The cloud keeps your photo queued while the Pi is offline."}
                </AppText>
              </View>
              <View style={styles.row}>
                <Button
                  compact
                  label="Demo layer"
                  variant={mode === "demo" ? "primary" : "secondary"}
                  disabled={busy}
                  onPress={() => {
                    setMode("demo");
                    setConfirmed(false);
                  }}
                />
                <Button
                  compact
                  label="Real report"
                  variant={mode === "report" ? "primary" : "secondary"}
                  disabled={busy || photo?.sample}
                  onPress={() => setMode("report")}
                />
              </View>
              <AppText variant="small" color={colors.textMuted}>
                {mode === "demo"
                  ? "Illustrative map position. These results stay private and never become shared road hazards."
                  : "Choose where the photo was taken. A detection creates an approximate, suspected shared report."}
              </AppText>
              <View style={styles.row}>
                {KATPADI_PLACES.map((p) => (
                  <Button
                    key={p.id}
                    compact
                    label={
                      p.id === "vit-vellore"
                        ? "VIT Vellore"
                        : "Katpadi Junction"
                    }
                    variant="secondary"
                    disabled={busy}
                    onPress={() => {
                      setLat(String(p.location.lat));
                      setLon(String(p.location.lon));
                      setConfirmed(false);
                    }}
                  />
                ))}
              </View>
              <View style={styles.coordinates}>
                <View style={styles.flex}>
                  <AppText variant="small">Latitude</AppText>
                  <TextInput
                    accessibilityLabel="Photo latitude"
                    style={styles.input}
                    keyboardType="numbers-and-punctuation"
                    editable={!busy}
                    value={lat}
                    onChangeText={(v) => {
                      setLat(v);
                      setConfirmed(false);
                    }}
                  />
                </View>
                <View style={styles.flex}>
                  <AppText variant="small">Longitude</AppText>
                  <TextInput
                    accessibilityLabel="Photo longitude"
                    style={styles.input}
                    keyboardType="numbers-and-punctuation"
                    editable={!busy}
                    value={lon}
                    onChangeText={(v) => {
                      setLon(v);
                      setConfirmed(false);
                    }}
                  />
                </View>
              </View>
              {mode === "report" && (
                <Button
                  compact
                  label={
                    confirmed
                      ? "Actual photo location confirmed ✓"
                      : "Confirm this is the photo’s actual location"
                  }
                  variant={confirmed ? "primary" : "secondary"}
                  disabled={busy}
                  onPress={() => setConfirmed((v) => !v)}
                />
              )}
              <Button
                label="Send to Banana Pi"
                icon="cloud-upload-outline"
                loading={busy}
                disabled={!photo || !deviceId || preparing}
                onPress={() => void send()}
              />
              {busy && (
                <Button
                  label="Stop upload request"
                  variant="ghost"
                  onPress={() => request.current?.abort()}
                />
              )}
            </Card>
          </Entrance>
          <SectionTitle>02 / findings.</SectionTitle>
          <Card>
            <AppText variant="heading">
              {job?.status === "completed"
                ? `${job.result?.detections.length || 0} pothole${job.result?.detections.length === 1 ? "" : "s"} detected.`
                : job
                  ? `${job.status[0].toUpperCase() + job.status.slice(1)}.`
                  : "Ready for your first photo."}
            </AppText>
            {job && (
              <AppText variant="caption" weight="bold">
                {job.mode === "demo"
                  ? "DEMO LOCATION · PRIVATE"
                  : "ACTUAL PHOTO LOCATION"}
              </AppText>
            )}
            {url ? (
              <Image
                source={{ uri: url }}
                style={styles.photo}
                resizeMode="contain"
                accessibilityLabel="Private Banana Pi photo inference findings"
                onError={() => {
                  setUrl("");
                  setError(
                    "Evidence image could not load. Reopen the screen to request a fresh link.",
                  );
                }}
              />
            ) : (
              <View style={styles.empty}>
                <AppText color={colors.textMuted}>
                  {job
                    ? "Private evidence loading…"
                    : "Bounding boxes and confidence will arrive from your Banana Pi."}
                </AppText>
              </View>
            )}
            {job?.result && (
              <>
                <View style={styles.row}>
                  <AppText weight="bold">
                    {Math.round(job.result.inferenceMs)} ms inference
                  </AppText>
                  <AppText weight="bold">
                    {job.result.detections.length
                      ? Math.round(
                          Math.max(
                            ...job.result.detections.map((d) => d.confidence),
                          ) * 100,
                        ) + "% highest confidence"
                      : "No detection above threshold"}
                  </AppText>
                </View>
                <AppText variant="small" selectable color={colors.textMuted}>
                  {job.result.modelRevision}
                </AppText>
                {job.result.detections.map((d, i) => (
                  <AppText variant="small" key={i}>
                    Pothole {i + 1}: {Math.round(d.confidence * 100)}% · box{" "}
                    {d.bbox.map((v) => v.toFixed(3)).join(", ")}
                  </AppText>
                ))}
              </>
            )}
            {photoDemoAlert(job) && (
              <>
                <Button
                  label="Preview pothole warning"
                  variant="secondary"
                  onPress={() => {
                    const text = photoDemoAlert(job)!;
                    setWarning(text);
                    void Speech.stop().then(() =>
                      Speech.speak(text, {
                        onError: () =>
                          setNotice(
                            "Speech unavailable; the warning remains visible.",
                          ),
                      }),
                    );
                  }}
                />
                <AppText variant="caption" color={colors.textMuted}>
                  Actual detection, scripted distances. No real ride or helmet
                  command is sent.
                </AppText>
                {!!warning && (
                  <>
                    <HudPreview
                      direction={NavigationDirection.LEFT}
                      distance={120}
                      units="metric"
                      live={false}
                    />
                    <View style={styles.warning}>
                      <AppText weight="bold">DEMO: POTHOLE · 50 m</AppText>
                      <AppText variant="small">
                        Scripted warning distance. The next navigation turn
                        stays visible.
                      </AppText>
                    </View>
                    <Button
                      compact
                      label="Stop warning preview"
                      variant="ghost"
                      onPress={() => {
                        setWarning("");
                        void Speech.stop();
                      }}
                    />
                  </>
                )}
              </>
            )}
            <AppText variant="small" color={colors.textMuted}>
              {job?.error ||
                (job?.status === "queued"
                  ? "Keep your Banana Pi powered and connected. The queued photo survives closing the app."
                  : job?.status === "processing"
                    ? "The Banana Pi has claimed this photo. Results update automatically."
                    : "Each result pin represents an approximate photo location. Zero detections create no map pin.")}
            </AppText>
          </Card>
          <Card>
            <AppText variant="heading">03 / on the map.</AppText>
            <Button
              label={mapOpen ? "Close Google Maps" : "Open Google Maps"}
              variant="secondary"
              icon="map-outline"
              onPress={() => setMapOpen((v) => !v)}
            />
            {mapOpen && (
              <MapCanvas
                riderPosition={null}
                destination={validPoint(point) ? point : null}
                potholes={
                  mode === "demo"
                    ? inferenceMarkers(data.jobs, "demo")
                    : liveHazards
                }
                style={{ height: 330 }}
                onDestination={(p) => {
                  setLat(p.lat.toFixed(6));
                  setLon(p.lon.toFixed(6));
                  setConfirmed(false);
                }}
                onHazard={(p) => setSelectedId(p.id)}
              />
            )}
            <AppText variant="small" color={colors.textMuted}>
              {mode === "demo"
                ? "Private demo layer. "
                : "Shared approximate road reports. "}
              {Platform.OS === "web" ? "Click" : "Press and hold"} a road to
              move the upload pin. Maps load only when opened.
            </AppText>
          </Card>
          <SectionTitle>04 / shared activity.</SectionTitle>
          {data.jobs.map((j) => (
            <Card key={j.id}>
              <AppText weight="bold">
                {j.status.toUpperCase()} ·{" "}
                {j.mode === "demo" ? "Demo" : "Road report"}
              </AppText>
              <AppText variant="small">
                {new Date(j.created_at).toLocaleString()} ·{" "}
                {j.result?.detections.length ?? "—"} potholes
              </AppText>
              <AppText variant="caption" selectable color={colors.textMuted}>
                {j.id}
              </AppText>
              <Button
                compact
                label={job?.id === j.id ? "Showing this result" : "Show result"}
                variant="secondary"
                onPress={() => setSelectedId(j.id)}
              />
              {["queued", "processing"].includes(j.status) && (
                <Button
                  compact
                  label="Cancel job"
                  variant="ghost"
                  onPress={() => void jobAction("cancelInference", j.id)}
                />
              )}
              {["failed", "cancelled"].includes(j.status) && (
                <Button
                  compact
                  label="Retry job"
                  variant="secondary"
                  onPress={() => void jobAction("retryInference", j.id)}
                />
              )}
            </Card>
          ))}
          {!data.jobs.length && (
            <AppText color={colors.textMuted}>
              Your uploads will appear here and on the website under the same
              job IDs.
            </AppText>
          )}
          <Button
            label={rowsOpen ? "Hide database rows" : "Show live database rows"}
            icon="server-outline"
            variant="secondary"
            onPress={() => setRowsOpen((v) => !v)}
          />
          {rowsOpen && (
            <Card>
              <AppText weight="bold">Your actual observation rows</AppText>
              {data.observations.length ? (
                data.observations.map((o) => (
                  <View key={o.id} style={styles.databaseRow}>
                    <AppText variant="caption" selectable>
                      {o.event_id}
                    </AppText>
                    <AppText variant="small">
                      {o.source === "replay" ? "Demo / replay" : o.source} ·{" "}
                      {o.confidence == null
                        ? "—"
                        : Math.round(o.confidence * 100) + "%"}
                    </AppText>
                    <AppText variant="caption">
                      {o.lat == null
                        ? "No position"
                        : `${o.lat.toFixed(5)}, ${o.lon!.toFixed(5)}`}{" "}
                      · {o.pothole_id ? "Shared record" : "Not published"}
                    </AppText>
                  </View>
                ))
              ) : (
                <AppText variant="small">No observations saved yet.</AppText>
              )}
            </Card>
          )}
          <Button
            label="Refresh shared activity"
            icon="refresh"
            variant="secondary"
            onPress={() => void refresh()}
          />
        </>
      )}
      {!!error && (
        <AppText accessibilityRole="alert" color={colors.danger}>
          {error}
        </AppText>
      )}
      {!!notice && (
        <AppText accessibilityLiveRegion="polite" color={colors.success}>
          {notice}
        </AppText>
      )}
    </Screen>
  );
}
const styles = StyleSheet.create({
  inputCard: { gap: 18 },
  photo: {
    width: "100%",
    height: 250,
    backgroundColor: "#161914",
    borderRadius: radius.sm,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.md,
  },
  device: {
    padding: 16,
    gap: 7,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
  },
  online: { backgroundColor: colors.successDim },
  coordinates: { flexDirection: "row", gap: spacing.md },
  flex: { flex: 1, gap: 7 },
  input: {
    minHeight: 50,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 12,
    fontFamily: fonts.regular,
    color: colors.text,
  },
  empty: {
    minHeight: 150,
    justifyContent: "center",
    padding: 18,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
  },
  databaseRow: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderColor: colors.border,
    gap: 5,
  },
  warning: {
    backgroundColor: colors.warningDim,
    borderRadius: radius.sm,
    padding: 16,
    gap: 7,
  },
});
