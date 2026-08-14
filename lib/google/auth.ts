import { createAdminClient } from "@/lib/supabase/admin";

export interface GoogleTokens {
  access_token: string;
  refresh_token: string | null;
  /** Epoch milliseconds. */
  expires_at: number;
}

/** Refresh this many ms before actual expiry, so an in-flight call can't age out. */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

/** Google access tokens last an hour; used when the response omits expires_in. */
const DEFAULT_TTL_MS = 60 * 60 * 1000;

export async function getGoogleTokens(
  userId: string
): Promise<GoogleTokens | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("google_tokens")
    .eq("id", userId)
    .single();

  if (error || !data?.google_tokens) return null;
  return data.google_tokens as GoogleTokens;
}

/**
 * Store tokens, merging rather than replacing.
 *
 * Google returns a refresh token only on the first consent. Every later sign-in
 * sends `provider_refresh_token: null`, so a naive overwrite would wipe the one
 * we need and silently break calendar sync an hour later.
 */
export async function saveGoogleTokens(
  userId: string,
  incoming: { access_token: string; refresh_token?: string | null; expires_in?: number }
): Promise<void> {
  const existing = await getGoogleTokens(userId);

  const tokens: GoogleTokens = {
    access_token: incoming.access_token,
    refresh_token: incoming.refresh_token ?? existing?.refresh_token ?? null,
    expires_at:
      Date.now() +
      (incoming.expires_in ? incoming.expires_in * 1000 : DEFAULT_TTL_MS),
  };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({ google_tokens: tokens })
    .eq("id", userId);

  if (error) throw new Error(`Failed to save Google tokens: ${error.message}`);
}

export async function clearGoogleTokens(userId: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("profiles")
    .update({ google_tokens: null })
    .eq("id", userId);
}

async function refreshAccessToken(refreshToken: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google token refresh failed (${response.status}): ${body}`);
  }

  return (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
}

/**
 * Returns a usable access token, refreshing first if it's close to expiry.
 *
 * Returns null when the user has never connected Google, or when the refresh
 * token has been revoked — callers should surface "reconnect Google" rather
 * than treating it as a transient failure.
 */
export async function getValidAccessToken(
  userId: string
): Promise<string | null> {
  const tokens = await getGoogleTokens(userId);
  if (!tokens) return null;

  if (Date.now() + REFRESH_BUFFER_MS < tokens.expires_at) {
    return tokens.access_token;
  }

  if (!tokens.refresh_token) {
    // Access token is stale and there's nothing to refresh with — the user
    // consented without offline access. Force a reconnect.
    await clearGoogleTokens(userId);
    return null;
  }

  try {
    const refreshed = await refreshAccessToken(tokens.refresh_token);
    await saveGoogleTokens(userId, {
      access_token: refreshed.access_token,
      expires_in: refreshed.expires_in,
    });
    return refreshed.access_token;
  } catch (err) {
    console.error("[google] refresh failed:", err);
    // A revoked grant never recovers on retry. Clear it so the UI can prompt
    // for reconnection instead of failing silently on every sync.
    await clearGoogleTokens(userId);
    return null;
  }
}

export async function isGoogleConnected(userId: string): Promise<boolean> {
  const tokens = await getGoogleTokens(userId);
  return Boolean(tokens?.refresh_token);
}
