import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});

/** Attributes a client-side navigation error to the route transition that triggered it. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
