import { createAdminClient } from "@/lib/supabase/admin";
import type { JobKind } from "@/lib/types";

/** Back-off between retries, indexed by attempt number. */
const RETRY_DELAYS_MS = [30_000, 2 * 60_000, 10 * 60_000];

/** A job stuck in `running` longer than this is assumed dead and reclaimed. */
const LOCK_TIMEOUT_MS = 5 * 60_000;

export async function enqueue(
  kind: JobKind,
  payload: Record<string, unknown>,
  opts: { delayMs?: number; dedupeKey?: string } = {}
): Promise<void> {
  const supabase = createAdminClient();

  // Recall retries webhooks, so the same bot can arrive several times. Without
  // this check each delivery would queue another job and we'd bill for the same
  // transcript repeatedly.
  if (opts.dedupeKey) {
    const { data: existing } = await supabase
      .from("job_queue")
      .select("id")
      .eq("kind", kind)
      .contains("payload", { dedupe_key: opts.dedupeKey })
      .in("status", ["pending", "running"])
      .limit(1);

    if (existing && existing.length > 0) return;
  }

  const { error } = await supabase.from("job_queue").insert({
    kind,
    payload: opts.dedupeKey
      ? { ...payload, dedupe_key: opts.dedupeKey }
      : payload,
    run_after: new Date(Date.now() + (opts.delayMs ?? 0)).toISOString(),
  });

  if (error) throw new Error(`Failed to enqueue ${kind}: ${error.message}`);
}

export interface ClaimedJob {
  id: string;
  kind: JobKind;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  created_at: string;
}

/**
 * Claim up to `limit` due jobs.
 *
 * The attempt is counted here, at claim time, not when a job fails. A job that
 * gets cut off mid-run (the platform ends the request, the isolate is evicted)
 * never reaches its own failure handler, so counting there let one bad job be
 * reclaimed and cut off again forever, re-running its model calls each time.
 * Counted up front, a job that keeps dying stops at `max_attempts` like any
 * other failure.
 *
 * Each claim is a conditional update on `status = 'pending'`, so two workers
 * racing for the same row can't both win it: the loser's update matches no
 * row and it moves on.
 */
export async function claimJobs(
  limit = 1,
  opts: { onExhausted?: ExhaustedHandler } = {}
): Promise<ClaimedJob[]> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  await reclaimAbandoned(opts.onExhausted);

  const { data, error } = await supabase
    .from("job_queue")
    .select("id, kind, payload, attempts, max_attempts, created_at")
    .eq("status", "pending")
    .lte("run_after", now)
    .order("run_after", { ascending: true })
    .limit(limit);

  if (error || !data || data.length === 0) return [];

  const claimed: ClaimedJob[] = [];
  for (const job of data) {
    const attempts = (job.attempts as number) + 1;
    const { data: won } = await supabase
      .from("job_queue")
      .update({ status: "running", locked_at: now, attempts })
      .eq("id", job.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (won) claimed.push({ ...(job as ClaimedJob), attempts });
  }
  return claimed;
}

/**
 * Jobs whose worker died mid-run. Ones with attempts left go back in the
 * queue; ones that have used them all are failed, and their owner is told,
 * instead of being retried into the same wall.
 */
async function reclaimAbandoned(onExhausted?: ExhaustedHandler): Promise<void> {
  const supabase = createAdminClient();
  const { data: stuck } = await supabase
    .from("job_queue")
    .select("id, kind, payload, attempts, max_attempts, created_at")
    .eq("status", "running")
    .lt("locked_at", new Date(Date.now() - LOCK_TIMEOUT_MS).toISOString())
    .limit(5);

  for (const job of stuck ?? []) {
    if ((job.attempts as number) >= (job.max_attempts as number)) {
      const message = "Stopped after repeated attempts that never finished";
      await supabase
        .from("job_queue")
        .update({ status: "failed", error: message, locked_at: null })
        .eq("id", job.id)
        .eq("status", "running");
      await onExhausted?.(job as ClaimedJob, message);
    } else {
      await supabase
        .from("job_queue")
        .update({ status: "pending", locked_at: null })
        .eq("id", job.id)
        .eq("status", "running");
    }
  }
}

/**
 * What failing for good means for a job's kind (a meeting marked failed so its
 * page can offer a retry). Passed in by the worker, so this module stays
 * ignorant of meetings.
 */
export type ExhaustedHandler = (job: ClaimedJob, message: string) => Promise<void>;

/**
 * Put a job back without counting this run against it: for a dependency that
 * simply isn't ready yet (Recall still transcribing), which is not a failure.
 */
export async function deferJob(job: ClaimedJob, delayMs: number, note: string): Promise<void> {
  await createAdminClient()
    .from("job_queue")
    .update({
      status: "pending",
      attempts: Math.max(0, job.attempts - 1),
      error: note,
      locked_at: null,
      run_after: new Date(Date.now() + delayMs).toISOString(),
    })
    .eq("id", job.id);
}

export async function completeJob(id: string): Promise<void> {
  await createAdminClient()
    .from("job_queue")
    .update({ status: "done", error: null, locked_at: null })
    .eq("id", id);
}

/**
 * Record a failure and either schedule a retry or give up.
 *
 * `job.attempts` already includes this run (it is counted at claim).
 * `retryable: false` skips remaining attempts: used when the failure can't
 * resolve itself (a deleted meeting, a malformed payload).
 */
export async function failJob(
  job: ClaimedJob,
  message: string,
  opts: { retryable?: boolean; onExhausted?: ExhaustedHandler } = {}
): Promise<{ exhausted: boolean }> {
  const supabase = createAdminClient();
  const retryable = opts.retryable ?? true;
  const exhausted = !retryable || job.attempts >= job.max_attempts;

  if (exhausted) {
    await supabase
      .from("job_queue")
      .update({ status: "failed", error: message, locked_at: null })
      .eq("id", job.id);
    await opts.onExhausted?.(job, message);
    return { exhausted: true };
  }

  const delay = RETRY_DELAYS_MS[Math.min(job.attempts - 1, RETRY_DELAYS_MS.length - 1)];
  await supabase
    .from("job_queue")
    .update({
      status: "pending",
      error: message,
      locked_at: null,
      run_after: new Date(Date.now() + delay).toISOString(),
    })
    .eq("id", job.id);
  return { exhausted: false };
}
