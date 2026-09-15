/**
 * The Cloudflare entry point.
 *
 * OpenNext generates `.open-next/worker.js`, which handles every HTTP request.
 * This file wraps it to add the one thing it cannot: a `scheduled` handler for
 * Cron Triggers.
 *
 * The cron does not reimplement anything. It builds an authenticated request
 * to `/api/cron/worker` and hands it to the same fetch handler a browser would
 * hit, so the job queue, the follow-up sweep and the digest all run through
 * exactly the code that already exists and is tested. No network round trip
 * is involved: the request never leaves the isolate.
 */

// Generated at build time by `opennextjs-cloudflare build`.
// `@ts-ignore`, not `@ts-expect-error`: the file is missing before the first
// build and present after it, and `@ts-expect-error` fails the second build
// the moment the error it was expecting stops existing. The lint rule that
// prefers `@ts-expect-error` is right in general and wrong for exactly this.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { default as handler } from "./.open-next/worker.js";

interface Env {
  CRON_SECRET?: string;
  NEXT_PUBLIC_APP_URL?: string;
  [key: string]: unknown;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface ScheduledController {
  scheduledTime: number;
  cron: string;
}

interface GeneratedHandler {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
}

const generated = handler as GeneratedHandler;

const worker = {
  fetch: generated.fetch,

  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    if (!env.CRON_SECRET) {
      // Without the secret the route rejects the request anyway. Saying so
      // here turns a silent 401 in the logs into an obvious misconfiguration.
      console.error("[cron] CRON_SECRET is not set; skipping the worker tick");
      return;
    }

    // The host only has to be a valid absolute URL; routing is by path. Using
    // the real app URL keeps anything that reads `request.url` truthful.
    const base = env.NEXT_PUBLIC_APP_URL || "https://app.closingly.app";

    const request = new Request(new URL("/api/cron/worker", base), {
      method: "GET",
      headers: { authorization: `Bearer ${env.CRON_SECRET}` },
    });

    const response = await generated.fetch(request, env, ctx);

    if (!response.ok) {
      console.error(
        `[cron] worker tick failed at ${new Date(controller.scheduledTime).toISOString()}: ${response.status}`
      );
    }
  },
};

export default worker;
