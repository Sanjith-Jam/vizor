import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
export const cloudUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
export const cloud =
  cloudUrl && key
    ? createClient(cloudUrl, key, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;
if (cloud)
  AppState.addEventListener("change", (state) =>
    state === "active"
      ? cloud.auth.startAutoRefresh()
      : cloud.auth.stopAutoRefresh(),
  );
export async function cloudApi<T>(
  action: string,
  payload: object = {},
  signal?: AbortSignal,
): Promise<T> {
  if (!cloud)
    throw new Error("Live services need the project’s Supabase configuration.");
  let {
    data: { session },
  } = await cloud.auth.getSession();
  if (session?.expires_at && session.expires_at * 1000 < Date.now() + 30000) {
    const refreshed = await cloud.auth.refreshSession();
    if (refreshed.error) throw refreshed.error;
    session = refreshed.data.session;
  }
  if (!session)
    throw new Error("Sign in on your Profile to use live services.");
  const response = await fetch(`${cloudUrl}/functions/v1/api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, payload }),
    signal: signal || AbortSignal.timeout(35000),
  });
  const json = await response.json();
  if (!response.ok || json?.error)
    throw new Error(json.error || "Service request failed");
  if (action === "evidence" && json.signedUrl?.startsWith("/"))
    json.signedUrl = cloudUrl + json.signedUrl;
  return json;
}
