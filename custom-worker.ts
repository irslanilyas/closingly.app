/**
 * The Cloudflare entry point.
 *
 * OpenNext generates `.open-next/worker.js`, which handles every HTTP request.
 * This file wraps it to add the one thing it cannot: a `scheduled` handler for
 * Cron Triggers.
 *
 * The scheduled handler does no work of its own. It makes one network request
 * to `/api/cron/worker` on the app's own Custom Domain, and Cloudflare runs
 * that request as a separate fetch invocation of this same Worker.
 *
 * That hop is the whole point. On the Workers Free plan the 10ms CPU limit is
 * enforced strictly on scheduled invocations and not on fetch invocations:
 * over a week of Workers Observability data, 4,180 cron ticks were killed at
 * exactly 10ms while 5,440 web requests, some using close to a second of CPU,
 * were killed zero times. The previous version handed the request to the
 * generated fetch handler in-process, so the job queue, the follow-up sweep
 * and every model call were billed to the scheduled invocation and died there.
 *
 * Awaiting a subrequest costs almost no CPU, so this handler stays far inside
 * its own limit however much work the tick turns out to have. Custom Domains
 * are explicitly reachable by `fetch()` from within the same zone; a route
 * would not be.
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

const PRODUCTION_ORIGIN = "https://app.closingly.app";

/**
 * The origin the tick is sent to.
 *
 * Parsed rather than trusted: a variable pasted with a stray newline once made
 * every tick throw `Invalid URL string` for two days, 2,510 times. A bad value
 * now falls back to production and says so, instead of taking the queue down.
 */
function tickOrigin(env: Env): string {
  const configured = env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) return PRODUCTION_ORIGIN;
  try {
    return new URL(configured).origin;
  } catch {
    console.error(
      `[cron] NEXT_PUBLIC_APP_URL is not a valid URL; using ${PRODUCTION_ORIGIN}`
    );
    return PRODUCTION_ORIGIN;
  }
}

const worker = {
  fetch: generated.fetch,

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    if (!env.CRON_SECRET) {
      // Without the secret the route rejects the request anyway. Saying so
      // here turns a silent 401 in the logs into an obvious misconfiguration.
      console.error("[cron] CRON_SECRET is not set; skipping the worker tick");
      return;
    }

    const response = await fetch(`${tickOrigin(env)}/api/cron/worker`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.CRON_SECRET}` },
    });

    if (!response.ok) {
      console.error(
        `[cron] worker tick failed at ${new Date(controller.scheduledTime).toISOString()}: ${response.status}`
      );
    }
  },
};

export default worker;
