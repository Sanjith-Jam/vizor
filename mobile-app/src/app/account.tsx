import React, { useState, useEffect } from "react";
import { TextInput, View, StyleSheet, Linking } from "react-native";
import { AppText, Button, Card, Screen, ListRow } from "../components/ui";
import { useCloud, cloud, cloudApi } from "../cloud/useCloud";
import { colors, spacing, fonts } from "../theme";
export default function Account() {
  const { session, pending, error, refresh } = useCloud();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [signup, setSignup] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [devices, setDevices] = useState<any[]>([]),
    [token, setToken] = useState<any>(null);
  useEffect(() => {
    if (cloud && session)
      void cloud
        .from("devices")
        .select("id,name")
        .then(({ data }) => setDevices(data || []));
  }, [session, token]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <AppText variant="display" weight="bold">
        Your connection.
      </AppText>
      <AppText color={colors.textMuted}>
        Account, helmet devices and shared road intelligence.
      </AppText>
      {!cloud ? (
        <Card>
          <AppText>Cloud setup pending</AppText>
          <AppText variant="small" color={colors.textMuted}>
            Configure the Supabase URL and public key before building to enable
            sign-in. Your local ride history and queued observations remain on
            this phone.
          </AppText>
        </Card>
      ) : session ? (
        <>
          <Card>
            <AppText weight="bold">{session.user.email}</AppText>
            <AppText variant="small" color={colors.textMuted}>
              {pending} observation{pending === 1 ? "" : "s"} waiting to sync.
            </AppText>
            <Button
              label="Sync now"
              icon="sync"
              variant="secondary"
              onPress={() => void run(refresh)}
            />
            <Button
              label="Sign out"
              variant="ghost"
              onPress={() => void cloud!.auth.signOut()}
            />
          </Card>
          <AppText variant="heading">Registered helmets</AppText>
          {devices.map((d) => (
            <ListRow
              key={d.id}
              icon="hardware-chip-outline"
              title={d.name}
              subtitle={d.id}
            />
          ))}
          <Button
            label="Register Banana Pi"
            icon="add"
            disabled={busy}
            onPress={() =>
              void run(async () =>
                setToken(
                  await cloudApi("registerDevice", { name: "My Vizor helmet" }),
                ),
              )
            }
          />
          {token ? (
            <Card>
              <AppText weight="bold">Save this device token now</AppText>
              <AppText selectable variant="small">
                {token.id}
                {"\n"}
                {token.token}
              </AppText>
              <AppText variant="small" color={colors.textMuted}>
                It is shown once. Set it locally on the Pi; never commit it.
              </AppText>
            </Card>
          ) : null}
        </>
      ) : (
        <Card>
          <AppText variant="heading">
            {signup ? "Create your account" : "Welcome back"}
          </AppText>
          {signup ? (
            <TextInput
              accessibilityLabel="Your name"
              placeholder="Your name"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              value={name}
              onChangeText={setName}
            />
          ) : null}
          <TextInput
            accessibilityLabel="Email address"
            placeholder="Email address"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            accessibilityLabel="Password"
            placeholder="Password (at least 8 characters)"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            secureTextEntry
            autoComplete={signup ? "new-password" : "current-password"}
            value={password}
            onChangeText={setPassword}
          />
          <Button
            label={signup ? "Create account" : "Sign in"}
            disabled={busy || password.length < 8 || !email.includes("@")}
            onPress={() =>
              void run(async () => {
                const result = signup
                  ? await cloud!.auth.signUp({
                      email,
                      password,
                      options: { data: { name } },
                    })
                  : await cloud!.auth.signInWithPassword({ email, password });
                if (result.error) throw result.error;
                if (signup && !result.data.session)
                  setMessage("Check your email to confirm your account.");
              })
            }
          />
          <Button
            label={signup ? "Already have an account?" : "Create an account"}
            variant="ghost"
            onPress={() => setSignup(!signup)}
          />
          <Button
            label="Reset password"
            variant="ghost"
            disabled={!email.includes("@")}
            onPress={() =>
              void run(async () => {
                const { error } = await cloud!.auth.resetPasswordForEmail(
                  email,
                  { redirectTo: "arhelmetnav://auth" },
                );
                if (error) throw error;
                setMessage(
                  "If an account exists, a reset email is on its way.",
                );
              })
            }
          />
        </Card>
      )}
      {message || error ? (
        <AppText accessibilityLiveRegion="polite" color={colors.warning}>
          {message || error}
        </AppText>
      ) : null}
      <AppText variant="small" color={colors.textMuted}>
        Voice audio is sent to Gemini only after you press Talk. Shared hazard
        records do not include rider identities. Native call answering is
        unavailable in this build.
      </AppText>
    </Screen>
  );
}
const styles = StyleSheet.create({
  input: {
    fontFamily: fonts.regular,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    minHeight: 56,
    padding: 14,
    borderRadius: 8,
    marginVertical: 6,
  },
});
