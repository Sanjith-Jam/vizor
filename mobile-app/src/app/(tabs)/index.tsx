import React, { useCallback, useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  AppText,
  Banner,
  Button,
  Card,
  Screen,
  SectionTitle,
  StatusBadge,
  Entrance,
  ListRow,
} from "../../components/ui";
import { RideActivity } from "../../components/RideActivity";
import { AssistantOrb } from "../../components/AssistantOrb";
import { useCloud } from "../../cloud/useCloud";
import { JourneyArtwork } from "../../components/JourneyArtwork";
import { HudPreview } from "../../components/HudPreview";
import { useHelmetConnection } from "../../hooks/useHelmetConnection";
import { useHistory } from "../../hooks/useHistory";
import { useRide } from "../../hooks/useRide";
import { useSettings } from "../../hooks/useSettings";
import { loadContacts } from "../../sos/contactsStore";
import { formatDistance, formatDuration } from "../../nav/geo";
import { colors, radius, spacing } from "../../theme";
import { STATUS_META } from "../../components/statusMeta";

export default function RideHome() {
  const router = useRouter();
  const { status, lastError } = useHelmetConnection();
  const { settings } = useSettings();
  const { session, telemetry, pending } = useCloud();
  const [readinessOpen, setReadinessOpen] = useState(false);
  const { hazards, rides } = useHistory();
  const ride = useRide();
  const [contactCount, setContactCount] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadContacts()
        .then((c) => setContactCount(c.length))
        .catch(() => setContactCount(0));
    }, []),
  );

  // A free ride started from here opens the dashboard once GPS is running.
  const [freeRidePending, setFreeRidePending] = useState(false);
  useEffect(() => {
    if (freeRidePending && ride.phase !== "starting") {
      setFreeRidePending(false);
      if (ride.phase === "active") router.push("/ride");
    }
  }, [freeRidePending, ride.phase, router]);

  const meta = STATUS_META[status];
  const lastRide = rides[0];
  const checks = [
    {
      title: "Helmet",
      ready: status === "connected",
      detail:
        status === "connected"
          ? "Bluetooth connected"
          : "Pair your helmet before riding",
      icon: "bluetooth" as const,
      open: () => router.push("/helmet"),
    },
    {
      title: "Location",
      ready: !!ride.position,
      detail: ride.position
        ? "Phone location available"
        : "Check your position when planning a ride",
      icon: "location-outline" as const,
      open: () => router.push("/navigate"),
    },
    {
      title: "SOS",
      ready: !!contactCount,
      detail: contactCount
        ? `${contactCount} emergency contacts saved`
        : "Add someone to call in an emergency",
      icon: "shield-checkmark-outline" as const,
      open: () => router.push("/contacts"),
    },
    {
      title: "Cloud",
      ready: !!session,
      detail: session
        ? `${pending} observations waiting to sync`
        : "Sign in for shared road reports",
      icon: "cloud-outline" as const,
      open: () => router.push("/account"),
    },
  ];
  const readyCount = checks.filter((check) => check.ready).length;

  return (
    <Screen edges={["top"]}>
      <Entrance>
        <View style={styles.header}>
          <AppText variant="heading" weight="extrabold">
            vizor.
          </AppText>
          <StatusBadge label={meta.label} color={meta.color} />
        </View>
        <View style={styles.greeting}>
          <AppText variant="display" weight="bold">
            {new Date().getHours() < 12
              ? "good morning."
              : new Date().getHours() < 18
                ? "good afternoon."
                : "good evening."}
          </AppText>
          <AppText color={colors.textMuted}>
            {new Date().toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </AppText>
        </View>
      </Entrance>
      <Entrance delay={80}>
        <Card
          style={styles.hero}
          onPress={() =>
            router.push(ride.phase === "active" ? "/ride" : "/navigate")
          }
          accessibilityLabel={
            ride.phase === "active"
              ? "Return to your active ride"
              : "Plan a ride"
          }
        >
          <Image
            source={require("../../../assets/images/helmet-concept.png")}
            style={styles.heroImage}
            resizeMode="cover"
            accessible={false}
          />
          <View style={styles.heroShade} />
          <View style={styles.heroHead}>
            <AppText variant="caption" weight="bold" color={colors.onDark}>
              VIZOR / RIDER CONSOLE
            </AppText>
            <Ionicons
              name="arrow-up-right-box"
              size={22}
              color={colors.onDark}
            />
          </View>
          <View style={styles.heroCopy}>
            <AppText variant="display" weight="bold" color={colors.onDark}>
              Eyes up.{String.fromCharCode(10)}Ride on.
            </AppText>
            <AppText
              variant="caption"
              color={colors.onDark}
              style={{
                alignSelf: "flex-start",
                backgroundColor: "#000B",
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 8,
              }}
            >
              Helmet concept render
            </AppText>
          </View>
          <View style={styles.heroFooter}>
            <View style={styles.heroAction}>
              <Ionicons name="navigate" size={19} color={colors.text} />
              <AppText weight="bold">
                {ride.phase === "active" ? "Return to ride" : "Plan a ride"}
              </AppText>
            </View>
            <AppText variant="small" color={colors.onDarkMuted}>
              India
            </AppText>
          </View>
        </Card>
      </Entrance>
      <Entrance delay={140}>
        <View style={styles.quickActions}>
          {(
            [
              {
                icon: "navigate-outline",
                label: "Navigate",
                action: () => router.push("/navigate"),
              },
              {
                icon: "scan-outline",
                label: "Road vision",
                action: () => router.push("/scan-road"),
              },
              {
                icon: "mic-outline",
                label: "Ask Vizor",
                action: () => router.push("/assistant"),
              },
            ] as const
          ).map((action) => (
            <Card
              key={action.label}
              style={styles.quickAction}
              onPress={action.action}
              accessibilityLabel={action.label}
            >
              <Ionicons name={action.icon} size={23} color={colors.text} />
              <AppText variant="caption" weight="semibold" align="center">
                {action.label}
              </AppText>
            </Card>
          ))}
        </View>
      </Entrance>
      <Entrance delay={200}>
        <Card
          style={styles.readiness}
          accessibilityState={{ expanded: readinessOpen }}
          onPress={() => setReadinessOpen((value) => !value)}
          accessibilityLabel={`${readyCount} of 4 ride checks ready. ${readinessOpen ? "Hide" : "Show"} checklist`}
        >
          <View style={styles.heroHead}>
            <View style={styles.flex}>
              <AppText weight="bold">Before you ride</AppText>
              <AppText variant="small" color={colors.textMuted}>
                {readyCount} of 4 checks ready
              </AppText>
            </View>
            <View style={styles.checkDots}>
              {checks.map((check) => (
                <View
                  key={check.title}
                  style={[
                    styles.checkDot,
                    check.ready && { backgroundColor: colors.success },
                  ]}
                >
                  <Ionicons
                    name={check.ready ? "checkmark" : "remove"}
                    size={13}
                    color={check.ready ? colors.onAccent : colors.textMuted}
                  />
                </View>
              ))}
            </View>
            <Ionicons
              name={readinessOpen ? "chevron-up" : "chevron-down"}
              size={18}
              color={colors.textMuted}
            />
          </View>
        </Card>
        {readinessOpen && (
          <View style={{ gap: 8, marginTop: 10 }}>
            {checks.map((check, index) => (
              <Entrance key={check.title} delay={index * 60}>
                <ListRow
                  icon={check.icon}
                  iconColor={check.ready ? colors.success : colors.textMuted}
                  title={check.title}
                  subtitle={check.detail}
                  onPress={check.open}
                />
              </Entrance>
            ))}
          </View>
        )}
      </Entrance>
      <Entrance delay={260}>
        <View style={styles.tiles}>
          <Card
            style={styles.feature}
            onPress={() => router.push("/hazards")}
            accessibilityLabel="Road reports"
          >
            <JourneyArtwork kind="road" size={100} />
            <AppText variant="heading" weight="bold">
              road reports.
            </AppText>
            <AppText variant="small" color={colors.textMuted}>
              {hazards.length
                ? `${hazards.length} sensor events saved.`
                : "Know what’s ahead."}
            </AppText>
          </Card>
          <Card
            style={styles.feature}
            onPress={() => router.push("/helmet")}
            accessibilityLabel={`Your helmet: ${meta.label}`}
          >
            <View style={styles.deviceGlyph}>
              <Ionicons name="bluetooth" size={32} color={colors.text} />
              <View
                style={[
                  styles.deviceDot,
                  {
                    backgroundColor:
                      status === "connected"
                        ? colors.success
                        : colors.textFaint,
                  },
                ]}
              />
            </View>
            <AppText variant="heading" weight="bold">
              your helmet.
            </AppText>
            <AppText variant="small" color={colors.textMuted}>
              {status === "connected"
                ? "Connected and ready."
                : "Pair to see live status."}
            </AppText>
            <AppText variant="caption" color={colors.textMuted}>
              {telemetry?.battery_percent != null
                ? `Last battery: ${telemetry.battery_percent}%`
                : "Battery unavailable"}
            </AppText>
          </Card>
        </View>
      </Entrance>
      <Card style={styles.assistantCard}>
        <View style={styles.heroHead}>
          <View style={styles.flex}>
            <AppText variant="heading" weight="bold">
              A little help,{String.fromCharCode(10)}along the way.
            </AppText>
            <AppText variant="small" color={colors.textMuted}>
              Directions. Road reports. Your helmet.
            </AppText>
          </View>
          <AssistantOrb size={54} />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {["Helmet status", "Upcoming potholes", "Repeat directions"].map(
            (query) => (
              <Button
                key={query}
                label={query}
                compact
                variant="secondary"
                onPress={() =>
                  router.push({ pathname: "/assistant", params: { query } })
                }
              />
            ),
          )}
        </ScrollView>
        <Button
          label="Talk to Vizor"
          icon="mic-outline"
          onPress={() => router.push("/assistant")}
        />
      </Card>
      <RideActivity rides={rides} units={settings.units} />
      <Card><AppText variant="heading">From road to record.</AppText><AppText variant="small" color={colors.textMuted}>Upload a photo. See real Banana Pi findings and the same database records on your website.</AppText><Button label="Connected photo demo" icon="images-outline" onPress={() => router.push("/live-demo")} /></Card>
      <Entrance delay={240}>
        <SectionTitle>across India.</SectionTitle>
        <View style={styles.mapCard}>
          <View style={styles.mapPreview}>
            <View style={styles.mapIcon}>
              <Ionicons name="map-outline" size={24} color={colors.text} />
            </View>
            <View style={styles.mapCopy}>
              <AppText variant="caption" weight="bold" color={colors.textMuted}>
                GOOGLE MAPS · INDIA
              </AppText>
              <AppText weight="semibold">Routes & nearby road reports</AppText>
            </View>
          </View>
          <View style={styles.mapCaption}>
            <Button
              label="Open live map"
              icon="map-outline"
              onPress={() => router.push("/navigate")}
            />
          </View>
        </View>
      </Entrance>
      {lastError && status !== "connected" ? (
        <Banner
          tone="danger"
          title="Helmet problem"
          message={lastError.message}
          action={
            <Button
              label="Fix it"
              compact
              variant="secondary"
              onPress={() => router.push("/helmet")}
            />
          }
        />
      ) : null}

      {contactCount === 0 ? (
        <Banner
          tone="warning"
          title="No emergency contacts"
          message="Add at least one so crash alerts can reach someone."
          action={
            <Button
              label="Add contact"
              compact
              variant="secondary"
              onPress={() => router.push("/contacts")}
            />
          }
        />
      ) : null}

      <Button
        label="Free ride (no route)"
        icon="speedometer"
        variant="secondary"
        loading={ride.phase === "starting"}
        onPress={() => {
          setFreeRidePending(true);
          void ride.startRide(null);
        }}
      />
      {ride.error ? (
        <Banner
          tone="danger"
          title="Couldn't start ride"
          message={ride.error}
        />
      ) : null}

      <SectionTitle>on your visor.</SectionTitle>
      <HudPreview
        direction={ride.hudFrame?.direction ?? null}
        distance={ride.hudFrame?.distance ?? 0}
        units={settings.units}
        live={status === "connected"}
      />

      <SectionTitle>recent journeys.</SectionTitle>
      {lastRide ? (
        <ListRow
          icon="trail-sign-outline"
          title={lastRide.destination || "Free ride"}
          subtitle={`${formatDistance(lastRide.distanceMeters, settings.units)} · ${new Date(lastRide.startedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
          onPress={() => router.push("/history")}
        />
      ) : (
        <Card>
          <AppText weight="semibold">A fresh start.</AppText>
          <AppText variant="small" color={colors.textMuted}>
            Your journeys appear here after you finish a ride.
          </AppText>
          <Button
            label="Explore a route"
            compact
            variant="ghost"
            onPress={() => router.push("/navigate")}
          />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  greeting: { gap: spacing.sm, marginTop: 24, marginBottom: 0 },
  hero: {
    backgroundColor: "#141512",
    minHeight: 330,
    padding: 22,
    overflow: "hidden",
    justifyContent: "space-between",
    gap: 20,
  },
  heroImage: {
    position: "absolute",
    top: 0,
    right: -50,
    width: "125%",
    height: "100%",
    opacity: 0.85,
  },
  heroShade: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,.28)",
  },
  heroHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  heroCopy: { gap: 8, marginTop: 30 },
  heroAction: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    backgroundColor: colors.surface,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
  },
  quickActions: { flexDirection: "row", gap: 10 },
  quickAction: {
    flex: 1,
    padding: 14,
    alignItems: "center",
    gap: 8,
    borderRadius: 22,
    minWidth: 0,
  },
  readiness: { padding: 18, borderWidth: 1, borderColor: colors.border },
  checkDots: { flexDirection: "row", gap: 3 },
  checkDot: {
    width: 19,
    height: 19,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceRaised,
  },
  deviceGlyph: {
    width: 90,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  deviceDot: {
    position: "absolute",
    bottom: 25,
    right: 23,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 3,
    borderColor: colors.surface,
  },
  assistantCard: { backgroundColor: "#E9EDE8", gap: 18 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 4 },
  heroFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  arrow: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  flex: { flex: 1, gap: 8 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  feature: {
    flex: 1,
    minWidth: 140,
    padding: 18,
    alignItems: "flex-start",
    gap: 4,
  },
  mapCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginTop: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mapPreview: {
    minHeight: 94,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  mapIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.accentDim,
    alignItems: "center",
    justifyContent: "center",
  },
  mapCopy: { flex: 1, gap: 4 },
  mapCaption: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
});
