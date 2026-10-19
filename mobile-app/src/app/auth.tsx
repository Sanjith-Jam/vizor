import React, { useEffect, useState } from "react";
import { TextInput } from "react-native";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { cloud } from "../cloud/client";
import { AppText, Button, Screen } from "../components/ui";
import { colors, spacing } from "../theme";
export default function AuthCallback() {
  const url = Linking.useURL();
  const router = useRouter();
  const [message, setMessage] = useState("Opening your secure account link…"),
    [recovery, setRecovery] = useState(false),
    [password, setPassword] = useState("");
  useEffect(() => {
    if (!url || !cloud) return;
    let cancelled = false;
    void (async () => {
      try {
        const query = new URLSearchParams(
          url.split("#")[1] || url.split("?")[1] || "",
        );
        if (query.get("error_description"))
          throw new Error(query.get("error_description")!);
        const access = query.get("access_token"),
          refresh = query.get("refresh_token");
        if (!access || !refresh)
          throw new Error(
            "This link is incomplete. Request a fresh account email.",
          );
        const { error } = await cloud!.auth.setSession({
          access_token: access,
          refresh_token: refresh,
        });
        if (error) throw error;
        if (cancelled) return;
        if (query.get("type") === "recovery") {
          setRecovery(true);
          setMessage("Choose a new password.");
        } else router.replace("/account");
      } catch (e) {
        if (!cancelled) setMessage((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);
  const save = async () => {
    try {
      const { error } = await cloud!.auth.updateUser({ password });
      if (error) throw error;
      router.replace("/account");
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  return (
    <Screen>
      <AppText variant="title">Your account</AppText>
      <AppText>{message}</AppText>
      {recovery ? (
        <>
          <TextInput
            accessibilityLabel="New password"
            placeholder="New password"
            placeholderTextColor={colors.textMuted}
            style={{
              padding: spacing.md,
              color: colors.text,
              backgroundColor: colors.surface,
            }}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <Button
            label="Save password"
            disabled={password.length < 8}
            onPress={() => void save()}
          />
        </>
      ) : null}
    </Screen>
  );
}
