import { TranscriptNotReadyError } from "@/lib/recall";

/**
 * Retry transient failures; give up on structural ones.
 *
 * Default is *not* retryable. A malformed prompt or a schema mismatch fails
 * identically every time, and retrying it three times just triples the token
 * bill for the same error.
 *
 * Split out of the cron worker on purpose: it's pure classification logic
 * with no dependency on the job queue or Supabase, and it's exactly the kind
 * of thing a future error message can silently stop matching a string check
 * for — worth a permanent test, not just a route handler nobody unit-tests.
 */
export function isRetryable(err: unknown): boolean {
  if (err && typeof err === "object" && "retryable" in err) {
    return (err as { retryable: boolean }).retryable;
  }

  if (err instanceof TranscriptNotReadyError) return true;

  const message = err instanceof Error ? err.message.toLowerCase() : "";
  return (
    message.includes("fetch failed") ||
    message.includes("timeout") ||
    message.includes("econnreset") ||
    message.includes("rate_limit") ||
    message.includes("overloaded") ||
    message.includes("429") ||
    message.includes("529")
  );
}
