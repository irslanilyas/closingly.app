import "server-only";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface RateLimitConfig {
  /** Unique per call site — becomes part of the DB key. */
  action: string;
  /** Requests allowed per window. */
  limit: number;
  windowMinutes: number;
}

/**
 * Fixed-window limiter, backed by the `rate_limits` table.
 *
 * "Fixed window" rather than sliding: a user could in principle burst near a
 * window boundary and get roughly 2x the nominal rate for a moment. That's an
 * acceptable trade for the alternative — a sliding window needs to keep every
 * request timestamp instead of one integer per window, and at this app's
 * scale the extra precision buys nothing.
 */
export async function checkRateLimit(
  userId: string,
  config: RateLimitConfig
): Promise<{ ok: boolean; remaining: number; retryAfterSeconds: number }> {
  const supabase = createAdminClient();
  const windowMs = config.windowMinutes * 60_000;
  const windowStartMs = Math.floor(Date.now() / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs).toISOString();

  const { data: count, error } = await supabase.rpc("increment_rate_limit", {
    p_user_id: userId,
    p_action: config.action,
    p_window_start: windowStart,
  });

  if (error) {
    // A limiter that's down should not itself take the product down. Log it
    // and let the request through — worse than an accurate cap, better than
    // every AI feature 500ing because a counter table hiccupped.
    console.error(`[rate-limit] ${config.action} check failed:`, error.message);
    return { ok: true, remaining: config.limit, retryAfterSeconds: 0 };
  }

  const used = count as number;
  const retryAfterSeconds = Math.ceil((windowStartMs + windowMs - Date.now()) / 1000);

  return {
    ok: used <= config.limit,
    remaining: Math.max(0, config.limit - used),
    retryAfterSeconds,
  };
}

/**
 * The caller's address.
 *
 * On Cloudflare, `cf-connecting-ip` is set by the edge and cannot be supplied
 * by the client; `x-forwarded-for` can be, so it is only a fallback for local
 * development and other hosts.
 */
export function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

/**
 * The same fixed window for callers who are not signed in: sign-in, the OAuth
 * callback, the public proposal tracker. Keyed by a hash of whatever
 * identifies the caller (their IP, in practice), so the raw value is never
 * stored. Fails open like the per-user limiter.
 */
export async function checkRateLimitByKey(
  key: string,
  config: RateLimitConfig
): Promise<{ ok: boolean; remaining: number; retryAfterSeconds: number }> {
  const supabase = createAdminClient();
  const windowMs = config.windowMinutes * 60_000;
  const windowStartMs = Math.floor(Date.now() / windowMs) * windowMs;

  const { data: count, error } = await supabase.rpc(
    "increment_keyed_rate_limit",
    {
      p_key: await sha256Hex(key),
      p_action: config.action,
      p_window_start: new Date(windowStartMs).toISOString(),
    }
  );

  if (error) {
    console.error(`[rate-limit] ${config.action} check failed:`, error.message);
    return { ok: true, remaining: config.limit, retryAfterSeconds: 0 };
  }

  const used = count as number;
  return {
    ok: used <= config.limit,
    remaining: Math.max(0, config.limit - used),
    retryAfterSeconds: Math.ceil((windowStartMs + windowMs - Date.now()) / 1000),
  };
}

/**
 * One ceiling across every feature that spends model tokens on a person's
 * behalf. Each route's own limit stops a burst on one button; this stops the
 * sum of them, so no mix of buttons can run up an unbounded bill in a day.
 * Resets at midnight UTC.
 */
export const AI_DAILY: RateLimitConfig = {
  action: "ai_daily",
  limit: 200,
  windowMinutes: 24 * 60,
};

/**
 * The limits for a request that calls a model: the route's own, then the
 * shared daily budget. Stops at the first one exceeded, so a request refused
 * by its route does not also spend from the day's budget.
 */
export async function checkAiBudget(
  userId: string,
  ...limits: RateLimitConfig[]
): Promise<{ ok: boolean; remaining: number; retryAfterSeconds: number }> {
  let last = { ok: true, remaining: Infinity, retryAfterSeconds: 0 };
  for (const config of [...limits, AI_DAILY]) {
    last = await checkRateLimit(userId, config);
    if (!last.ok) return last;
  }
  return last;
}

/** Standard 429 body + Retry-After header, so every route returns the same shape. */
export function rateLimitResponse(retryAfterSeconds: number) {
  const hours = Math.ceil(retryAfterSeconds / 3600);
  return NextResponse.json(
    {
      error: "rate_limited",
      message:
        retryAfterSeconds > 3600
          ? `You've reached today's limit for this. It resets in about ${hours} hours.`
          : "You're doing that a bit fast. Try again in a moment.",
    },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}
