/**
 * How the Supabase session cookies are written, by every client that writes
 * them: the browser, server components and route handlers, and the proxy.
 *
 * Not HttpOnly, by design: the browser client reads the session from them.
 * Secure outside development, so the session never travels over plain HTTP,
 * and SameSite=Lax, so it is not sent on cross-site subrequests (the OAuth
 * return from Google is a top-level navigation, which Lax allows).
 */
export const SESSION_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};
