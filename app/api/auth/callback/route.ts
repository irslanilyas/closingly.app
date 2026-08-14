import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { saveGoogleTokens } from "@/lib/google/auth";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  // Google reports consent failures here rather than as a missing code.
  const oauthError = searchParams.get("error");
  if (oauthError) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(oauthError)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  // The provider tokens are only exposed on this one response — Supabase does
  // not persist them, and they are absent from every later getSession() call.
  // Capture them now or lose Calendar/Gmail access entirely.
  const { session } = data;
  if (session.provider_token) {
    try {
      await saveGoogleTokens(session.user.id, {
        access_token: session.provider_token,
        refresh_token: session.provider_refresh_token,
      });
    } catch (err) {
      // Sign-in itself succeeded; only the Google integration is degraded.
      // Let the user in and let Settings show it as disconnected.
      console.error("[auth] failed to persist Google tokens:", err);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
