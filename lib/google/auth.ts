import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSealingKey, isSealed, open, seal } from "@/lib/crypto/sealed";

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

  const stored = data.google_tokens as unknown;
  if (isSealed(stored)) {
    try {
      return await open<GoogleTokens>(stored);
    } catch (err) {
      // A rotated or missing key. The honest outcome is "not connected", which
      // the UI already turns into a reconnect prompt, not a crash.
      console.error("[google] stored tokens could not be opened:", err);
      return null;
    }
  }

  // Written before tokens were encrypted. Still valid; the next save (a sign-in
  // or an access-token refresh, at most an hour away) seals it.
  return stored as GoogleTokens;
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

  // Sealed at rest: the refresh token is standing access to someone's Gmail
  // and calendar, and the profile row is readable through their own session.
  // Without a key configured it still saves, loudly, rather than breaking
  // Google sign-in for everyone over a missing secret.
  let stored: unknown = tokens;
  if (hasSealingKey()) {
    stored = await seal(tokens);
  } else {
    console.error("[google] TOKEN_ENCRYPTION_KEY is not set; tokens stored unencrypted");
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({ google_tokens: stored })
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
