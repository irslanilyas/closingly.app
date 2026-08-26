import * as Sentry from "@sentry/nextjs";

/** Same config as sentry.server.config.ts — the proxy/middleware runs on the edge runtime, which needs its own init call. */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});
