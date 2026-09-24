import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isDev = process.env.NODE_ENV === "development";

/**
 * Where the browser is allowed to load from and talk to.
 *
 * Scripts stay on 'self' plus inline: Next.js and the theme script inject
 * inline scripts, and nonces would force every page to render dynamically.
 * What the policy still enforces is the part that matters most here: no script
 * from another origin, no page embedding this one (clickjacking), no plugins,
 * no <base> hijack, forms only to ourselves and Google's sign-in, and network
 * calls only to Supabase and Sentry. Audio playback streams from Recall's
 * storage, hence https: for media. Development adds 'unsafe-eval', which React
 * needs for its dev tooling and production never uses.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // Two years, the preload-list minimum, but deliberately not submitted to the
  // preload list: that is a one-way door for the whole domain.
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      ]),
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
    // Pull only the functions actually referenced instead of walking the
    // whole barrel file. Heroicons is already on Next's built-in list.
    optimizePackageImports: ["date-fns"],
  },
};

// Sentry's wrapper only matters for builds (source maps, release tagging).
// Locally it adds seconds to every dev start for nothing, and the runtime SDK
// is initialised from instrumentation either way.
export default process.env.NODE_ENV === "development" ? nextConfig : withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Only Sentry's own build plugin needs to talk during CI/deploys; a quiet
  // local `next build` shouldn't print anything extra.
  silent: !process.env.CI,
  // No source-map upload without an auth token configured — this repo
  // doesn't have one yet, and stack traces are still readable without it.
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});