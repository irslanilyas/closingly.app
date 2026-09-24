import { NextResponse, type NextRequest } from "next/server";
import { GOOGLE_SCOPE_LIST } from "@/lib/google/scopes";
import { OAUTH_NEXT_COOKIE, OAUTH_STATE_COOKIE } from "@/lib/google/oauth-cookies";
import { checkRateLimitByKey, clientIp } from "@/lib/rate-limit";

/**
 * Per network, not per person: nobody is signed in yet. Generous enough for a
 * shared office, tight enough that the endpoint cannot be used to hammer
 * Google's authorisation server through us.
 */
const SIGN_IN_LIMIT = { action: "sign_in", limit: 20, windowMinutes: 10 };

// Google redirects straight back to our own domain, so the consent screen names
// Closingly instead of the Supabase project host.
export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);

  const limit = await checkRateLimitByKey(clientIp(request), SIGN_IN_LIMIT);
  if (!limit.ok) {
    return NextResponse.redirect(`${origin}/login?error=too_many_attempts`);
  }

  const state = crypto.randomUUID();

  const next = searchParams.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${origin}/api/auth/callback`,
    response_type: "code",
    scope: ["openid", "email", "profile", ...GOOGLE_SCOPE_LIST].join(" "),
    // Without both, Google returns no refresh token and calendar sync dies an
    // hour after login.
    access_type: "offline",
    prompt: "consent",
    state,
  });

  const response = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  );

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax, not strict: the return trip from Google is a cross-site top-level GET.
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600,
  };
  response.cookies.set(OAUTH_STATE_COOKIE, state, cookieOptions);
  response.cookies.set(OAUTH_NEXT_COOKIE, safeNext, cookieOptions);

  return response;
}
