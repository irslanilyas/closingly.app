/**
 * Completes the proxy's file trace before the Cloudflare adapter copies it.
 *
 * Runs right after `next build`, as part of the adapter's `buildCommand`
 * (see open-next.config.ts), so it executes inside the standalone-output
 * environment the adapter sets up and before the adapter copies any files.
 *
 * The problem, in order:
 *
 *   1. Next's tracer does `require("@opentelemetry/api")` and falls back to
 *      its own compiled copy if the package is missing.
 *   2. Sentry depends on `@opentelemetry/api`, so the package is installed and
 *      the require resolves to it. Next traces only its `build/src` files.
 *   3. The adapter bundles the proxy with esbuild under the "module" condition,
 *      which resolves the package to `build/esm`, and that folder was never
 *      traced, so the proxy bundle fails with `Could not resolve`.
 *   4. The adapter would normally alias the package to Next's compiled copy,
 *      but only when it is not installed at the project root, and Sentry keeps
 *      it installed. `outputFileTracingIncludes` does not help either: under
 *      Turbopack it is applied to route traces and never to the proxy trace.
 *
 * So this adds the missing `build/esm` files to `middleware.js.nft.json`, the
 * exact file the adapter's middleware copy step reads.
 *
 * Remove this script once either the adapter aliases the package regardless of
 * whether it is installed, or Next applies tracing includes to the proxy. The
 * build will then pass without it, and the ESM count logged below will be 0.
 */

import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const serverDir = path.join(projectRoot, ".next", "server");
const traceFile = path.join(serverDir, "middleware.js.nft.json");
const esmDir = path.join(projectRoot, "node_modules", "@opentelemetry", "api", "build", "esm");

if (!fs.existsSync(traceFile)) {
  console.log("[complete-proxy-trace] no middleware trace found, nothing to do");
  process.exit(0);
}

if (!fs.existsSync(esmDir)) {
  // Happens if Sentry (and with it @opentelemetry/api) is ever removed. The
  // adapter's own alias then takes over and this step is unnecessary.
  console.log("[complete-proxy-trace] @opentelemetry/api is not installed, nothing to do");
  process.exit(0);
}

/** Every file under a directory, as absolute paths. */
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const trace = JSON.parse(fs.readFileSync(traceFile, "utf8"));
const files = Array.isArray(trace.files) ? trace.files : [];

// Trace entries are relative to `.next/server/` with forward slashes, e.g.
// `../../node_modules/@opentelemetry/api/build/src/api/context.js`, on every
// platform. Match that exactly so the adapter resolves them the same way.
const toTraceEntry = (absolute) =>
  path.relative(serverDir, absolute).split(path.sep).join("/");

const existing = new Set(files);
const additions = walk(esmDir)
  .map(toTraceEntry)
  .filter((entry) => !existing.has(entry));

if (additions.length === 0) {
  console.log("[complete-proxy-trace] proxy trace already complete (0 files added)");
  process.exit(0);
}

// New entries go on the end, so every original `files[i]` keeps its
// `fileHashes[i]`. `fileHashes` is an index-aligned array; it is padded with
// null rather than filled with invented values, because Next's trace loader
// records a hash only `if (contentHash)` and skips falsy entries. The
// Cloudflare adapter reads `files` alone.
trace.files = [...files, ...additions];
if (Array.isArray(trace.fileHashes)) {
  trace.fileHashes = [
    ...trace.fileHashes,
    ...new Array(trace.files.length - trace.fileHashes.length).fill(null),
  ];
}
fs.writeFileSync(traceFile, JSON.stringify(trace));

console.log(
  `[complete-proxy-trace] added ${additions.length} @opentelemetry/api build/esm files to middleware.js.nft.json`
);
