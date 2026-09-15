import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * No cache overrides.
 *
 * Every route in this app is dynamic: there is no ISR, no `revalidate`, and no
 * `"use cache"`. The adapter's docs are explicit that SSR and API routes work
 * without any caching configuration, so configuring R2 here would add a
 * storage bucket, a billing requirement, and a moving part that stores nothing.
 */
const config = {
  ...defineCloudflareConfig({}),

  /**
   * What the adapter runs for "next build".
   *
   * The adapter first switches Next into standalone output (it sets
   * NEXT_PRIVATE_STANDALONE in its own process), then runs this command in that
   * environment. Running the trace fix here, rather than via `--skipNextBuild`
   * with a separate `next build`, means it always sees exactly the build the
   * adapter is about to package. See scripts/cloudflare/complete-proxy-trace.mjs.
   */
  buildCommand: "npm run build:next-cf",
};

export default config;
