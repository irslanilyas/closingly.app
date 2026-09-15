import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Paths that must work without a Supabase session. Each authenticates itself:
// the Recall webhook by signature, the cron worker by CRON_SECRET, and the
// public proposal page and its tracker by the share token in the URL.
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/google",
  "/api/auth/callback",
  "/api/recall/webhook",
  "/api/cron/",
  "/p/",
  "/api/track/",
];

// Supabase stores the session across one or more `sb-<ref>-auth-token` cookies
// (chunked when large). Expire all of them so a dead session can't be replayed.
function clearAuthCookies(request: NextRequest, response: NextResponse) {
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("sb-")) {
      response.cookies.set(cookie.name, "", { maxAge: 0, path: "/" });
    }
  }
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // A revoked or expired refresh token makes getSession() throw. Without this
  // guard the middleware crashes on every request — including /login — and the
  // browser keeps replaying the dead cookie, so the app never recovers.
  let session = null;
  let staleSession = false;

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      staleSession = true;
    } else {
      session = data.session;
    }
  } catch {
    staleSession = true;
  }

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!session && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const redirect = NextResponse.redirect(url);
    if (staleSession) clearAuthCookies(request, redirect);
    return redirect;
  }

  // Already on a public path but carrying a dead cookie — drop it here too,
  // otherwise every subsequent request pays for the failed refresh again.
  if (staleSession) {
    clearAuthCookies(request, supabaseResponse);
    return supabaseResponse;
  }

  if (session && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
