import * as Sentry from "@sentry/nextjs";

/**
 * Next.js calls `register()` once per runtime at boot. The nodejs and edge
 * runtimes are separate processes with separate Sentry SDKs, so each needs
 * its own init file loaded conditionally rather than one shared import.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/** Captures errors thrown during rendering that error.tsx's boundary also sees — this is what attributes them to the request that caused them. */
export const onRequestError = Sentry.captureRequestError;
