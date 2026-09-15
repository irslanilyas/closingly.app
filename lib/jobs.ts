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
}

/**
 * Claim up to `limit` due jobs.
 *
 * Single-worker-friendly rather than bulletproof: we read then write, so two
 * concurrent workers could in principle claim the same row. With one cron
 * trigger that can't happen, and every job is written to be idempotent anyway.
 * Swap this for `SELECT ... FOR UPDATE SKIP LOCKED` via an RPC if we ever run
 * workers in parallel.
 */
export async function claimJobs(limit = 5): Promise<ClaimedJob[]> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // Reclaim anything whose worker died mid-run.
  await supabase
    .from("job_queue")
    .update({ status: "pending", locked_at: null })
    .eq("status", "running")
    .lt("locked_at", new Date(Date.now() - LOCK_TIMEOUT_MS).toISOString());

  const { data, error } = await supabase
    .from("job_queue")
    .select("id, kind, payload, attempts, max_attempts")
    .eq("status", "pending")
    .lte("run_after", now)
    .order("run_after", { ascending: true })
    .limit(limit);

  if (error || !data || data.length === 0) return [];

  const ids = data.map((j) => j.id);
  await supabase
    .from("job_queue")
    .update({ status: "running", locked_at: now })
    .in("id", ids);

  return data as ClaimedJob[];
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
 * `retryable: false` skips remaining attempts — used when the failure can't
 * resolve itself (a deleted meeting, a malformed payload).
 */
export async function failJob(
  job: ClaimedJob,
  message: string,
  opts: { retryable?: boolean } = {}
): Promise<void> {
  const supabase = createAdminClient();
  const attempts = job.attempts + 1;
  const retryable = opts.retryable ?? true;
  const exhausted = attempts >= job.max_attempts;

  if (!retryable || exhausted) {
    await supabase
      .from("job_queue")
      .update({ status: "failed", attempts, error: message, locked_at: null })
      .eq("id", job.id);
    return;
  }

  const delay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)];
  await supabase
    .from("job_queue")
    .update({
      status: "pending",
      attempts,
      error: message,
      locked_at: null,
      run_after: new Date(Date.now() + delay).toISOString(),
    })
    .eq("id", job.id);
}
