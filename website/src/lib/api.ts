import { supabase } from "./supabase";
export async function api<T>(
  action: string,
  payload: object = {},
  signal?: AbortSignal,
): Promise<T> {
  if (!supabase)
    throw new Error(
      "Live services are not configured. Explore the labeled demo instead.",
    );
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in to use live services.");
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ action, payload }),
      signal: signal || AbortSignal.timeout(35000),
    },
  );
  const data = await response.json();
  if (!response.ok || data?.error)
    throw new Error(data.error || "Request failed");
  if (action === "evidence" && data.signedUrl?.startsWith("/"))
    data.signedUrl = import.meta.env.VITE_SUPABASE_URL + data.signedUrl;
  return data;
}
