import { NextResponse, type NextRequest } from "next/server";
import { DEMO_RESET_COOKIE } from "@/lib/demo";
import { checkRateLimitByKey, clientIp } from "@/lib/rate-limit";

const RESET_LIMIT = { action: "demo_reset", limit: 10, windowMinutes: 10 };

/**
 * Demo helper: drops the session and flags the next sign-in as a replay, so
 * setup runs again instead of landing on a finished dashboard.
 *
 * The flag is only honoured for founder accounts — the check happens in the
 * auth callback, once there is an identity to check. For anyone else this is
 * an ordinary sign-out followed by an ordinary sign-in.
 */
export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);

  const limit = await checkRateLimitByKey(clientIp(request), RESET_LIMIT);
  if (!limit.ok) {
    return NextResponse.redirect(`${origin}/login?error=too_many_attempts`);
  }

  const response = NextResponse.redirect(`${origin}/api/auth/google`);

  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("sb-")) {
      response.cookies.set(cookie.name, "", { maxAge: 0, path: "/" });
    }
  }

  response.cookies.set(DEMO_RESET_COOKIE, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return response;
}
