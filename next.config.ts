import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig & {
  allowedDevOrigins?: string[];
} = {
  allowedDevOrigins: [
    "*.trycloudflare.com",
  ],
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Only Sentry's own build plugin needs to talk during CI/deploys; a quiet
  // local `next build` shouldn't print anything extra.
  silent: !process.env.CI,
  // No source-map upload without an auth token configured — this repo
  // doesn't have one yet, and stack traces are still readable without it.
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});