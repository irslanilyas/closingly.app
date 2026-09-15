import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Cloudflare (OpenNext) bundles the proxy with esbuild under the "module"
  // condition, which resolves @opentelemetry/api to its build/esm entry. Next's
  // file tracing copies only build/src, so that entry is missing and the proxy
  // bundle cannot resolve it. The package is installed at all only because
  // Sentry depends on it, and its presence also switches off the adapter's own
  // fallback to Next's compiled copy. Including the whole build folder is the
  // fix the adapter's source code names. Matched with { dot, contains }, "*"
  // covers every route and the middleware entry.
  outputFileTracingIncludes: {
    "*": ["./node_modules/@opentelemetry/api/build/**/*"],
  },
  experimental: {
    // Persist Turbopack's compiler artifacts to `.next` between runs. Dev
    // already does this by default since 16.1 — builds don't, and this repo
    // lives on a mechanical drive where re-doing that work is the single
    // most expensive thing in the loop.
    turbopackFileSystemCacheForBuild: true,
    // Pull only the icons actually referenced instead of walking the whole
    // barrel file. lucide-react exports well over a thousand of them.
    optimizePackageImports: ["lucide-react", "date-fns"],
  },
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