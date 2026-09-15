import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { saveGoogleTokens } from "@/lib/google/auth";
import { OAUTH_NEXT_COOKIE, OAUTH_STATE_COOKIE } from "@/lib/google/oauth-cookies";

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const next = request.cookies.get(OAUTH_NEXT_COOKIE)?.value ?? "/";

  const fail = (reason: string) => {
    const response = NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(reason)}`
    );
    response.cookies.delete(OAUTH_STATE_COOKIE);
    response.cookies.delete(OAUTH_NEXT_COOKIE);
    return response;
  };

  // Google reports consent failures here rather than as a missing code.
  const oauthError = searchParams.get("error");
  if (oauthError) return fail(oauthError);
  if (!code) return fail("missing_code");
  if (!state || !expectedState || state !== expectedState) return fail("state_mismatch");

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${origin}/api/auth/callback`,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    console.error("[auth] Google code exchange failed:", await tokenResponse.text());
    return fail("exchange_failed");
  }

  const tokens = (await tokenResponse.json()) as GoogleTokenResponse;
  if (!tokens.id_token) return fail("exchange_failed");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: tokens.id_token,
  });

  if (error || !data.session) {
    console.error("[auth] Supabase signInWithIdToken failed:", error?.message);
    return fail("exchange_failed");
  }

  try {
    await saveGoogleTokens(data.session.user.id, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
    });
  } catch (err) {
    // Sign-in itself succeeded; only the Google integration is degraded.
    // Let the user in and let Settings show it as disconnected.
    console.error("[auth] failed to persist Google tokens:", err);
  }

  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const response = NextResponse.redirect(`${origin}${safeNext}`);
  response.cookies.delete(OAUTH_STATE_COOKIE);
  response.cookies.delete(OAUTH_NEXT_COOKIE);
  return response;
}
