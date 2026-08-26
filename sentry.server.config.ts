import * as Sentry from "@sentry/nextjs";

/**
 * Error tracking only, deliberately narrow. No session replay, no in-app
 * feedback widget — those are separate product surfaces this app didn't ask
 * for and would add client bundle weight for nothing used. `tracesSampleRate`
 * stays low even in prod: this exists to know when something breaks, not to
 * profile every request.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});
