import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueue, claimJobs, completeJob, failJob, type ClaimedJob } from "@/lib/jobs";
import { getBotStatus, getTranscript } from "@/lib/recall";
import { dealFromTranscript } from "@/lib/pipeline/from-transcript";
import { isRetryable } from "@/lib/retry";
import { latestSpecification, latestFacts } from "@/lib/onboarding/persist";
import { generateStarterProposal } from "@/lib/onboarding/starter-proposal";
import type { GenerationState } from "@/lib/types";
import { sweepFollowUps } from "@/lib/follow-ups/sweep";


/**
 * A non-terminal meeting whose row hasn't moved in this long gets checked
 * directly against Recall. Short enough to catch a dropped webhook within a
 * few worker ticks; long enough not to fight the webhook's own 20s processing
 * delay or flag a meeting that's still genuinely in progress.
 */
const STALE_MINUTES = 5;

/** How many stale meetings to reconcile per tick: two Recall calls each. */
const RECONCILE_LIMIT = 5;

/**
 * Jobs claimed per tick.
 *
 * Sized against the Workers Free plan cap of 50 outbound requests per
 * invocation, not against time. A transcript job makes roughly fifteen
 * (Supabase reads and writes, two model calls, Recall), so two leave headroom,
 * and a tick that ran jobs skips the periodic phases entirely rather than
 * risk being cut off by the cap halfway through a write.
 */
const JOBS_PER_TICK = 2;

/**
 * The clock the phases below run against.
 *
 * The tick arrives as its own fetch invocation (see custom-worker.ts), and the
 * scheduled handler stays connected until this responds, so the work runs
 * inline before the response rather than in `after`: on Workers, work queued
 * behind a sent response is capped at 30 seconds, which a transcript job can
 * outlast. The budget keeps one tick inside the minute before the next one, so
 * ticks never overlap. Each phase declares roughly what it needs and is
 * skipped rather than started when the clock cannot cover it, which matters
 * most for the sweep: a half-written queue is worse than no queue.
 */
const BUDGET_MS = 52_000;
const RECONCILE_BUDGET_MS = 8_000;
/** Up to four model-written drafts, at a few seconds each. */
const SWEEP_BUDGET_MS = 25_000;

/**
 * Drains the job queue, then runs the periodic sweeps.
 *
 * Called once a minute by the Cron Trigger in wrangler.jsonc, which
 * custom-worker.ts turns into an authenticated POST. POST because it changes
 * state; a GET could be triggered by a prefetch or a crawler holding the URL.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deadline = Date.now() + BUDGET_MS;
  const timeLeft = () => deadline - Date.now();

  const jobs = await claimJobs(JOBS_PER_TICK);
  for (const job of jobs) {
    await runJob(job);
  }

  // Only on ticks with nothing queued, which is nearly all of them: a dropped
  // webhook leaves nothing in the queue to claim, and nothing ever emits an
  // event saying a deal has gone quiet, so something still has to look. A
  // one-minute delay costs neither phase anything.
  if (jobs.length === 0) {
    if (timeLeft() > RECONCILE_BUDGET_MS) await reconcileStaleMeetings();
    if (timeLeft() > SWEEP_BUDGET_MS) await runFollowUpSweeps();
  }

  return NextResponse.json({ processed: jobs.length });
}

/**
 * Ask Recall directly about meetings our own webhook seems to have lost
 * track of, instead of waiting indefinitely for a message that may never
 * arrive — a rotated signing secret, a disabled endpoint, a dropped delivery
 * are all silent from our side otherwise. This is what turned a stuck meeting
 * into an eleven-hour support conversation the first time it happened.
 */
async function reconcileStaleMeetings() {
  const supabase = createAdminClient();

  const { data: stale, error } = await supabase
    .from("meetings")
    .select("id, recall_bot_id")
    .in("status", ["bot_scheduled", "recording", "processing"])
    .not("recall_bot_id", "is", null)
    .lt(
      "updated_at",
      new Date(Date.now() - STALE_MINUTES * 60_000).toISOString()
    )
    .limit(RECONCILE_LIMIT);

  if (error) {
    console.error("[cron/worker] reconcile query failed:", error.message);
    return;
  }
  if (!stale || stale.length === 0) return;

  for (const meeting of stale) {
    try {
      await reconcileMeeting(meeting.id, meeting.recall_bot_id as string);
    } catch (err) {
      // One bad Recall lookup shouldn't stop the rest of the sweep.
      console.error(
        `[cron/worker] reconcile failed for meeting ${meeting.id}:`,
        err
      );
    }
  }
}

async function reconcileMeeting(meetingId: string, botId: string) {
  const supabase = createAdminClient();
  const bot = await getBotStatus(botId);

  if (bot.isFatal) {
    await supabase
      .from("meetings")
      .update({ status: "failed", error: "Recall reported a fatal bot error" })
      .eq("id", meetingId);
    return;
  }

  if (bot.isDone) {
    console.log(
      `[cron/worker] reconcile: bot ${botId} finished with no webhook received — enqueuing meeting ${meetingId}`
    );
    // dealFromTranscript is idempotent on deal_id and enqueue dedupes on
    // botId, so this is safe even if the missing webhook turns up later.
    await enqueue(
      "process_transcript",
      { meeting_id: meetingId, bot_id: botId },
      { dedupeKey: botId }
    );
    return;
  }

  // Still genuinely in progress. Touch the row so a long call doesn't get
  // re-checked against Recall every minute for its whole duration.
  await supabase
    .from("meetings")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", meetingId);
}

async function runJob(job: ClaimedJob) {
  try {
    switch (job.kind) {
      case "process_transcript":
        await processTranscript(job);
        break;
      case "starter_proposal":
        await runStarterProposal(job);
        break;
      default:
        throw new Error(`Unknown job kind: ${job.kind}`);
    }
    await completeJob(job.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron/worker] ${job.kind} failed:`, message);
    await failJob(job, message, { retryable: isRetryable(err) });
  }
}

/**
 * Fetch a finished meeting's transcript, then turn it into a deal.
 *
 * Split into two halves deliberately: once the transcript is stored, a failure
 * in the AI half must not cause the transcript to be re-fetched from Recall on
 * retry. The transcript is the expensive, once-only artefact.
 */
async function processTranscript(job: ClaimedJob) {
  const meetingId = job.payload.meeting_id as string;
  const botId = job.payload.bot_id as string | undefined;
  // Hand-imported transcripts run this same job, so the created deal can be
  // told apart from one the agent recorded itself.
  const source = (job.payload.source as string) ?? "meeting_agent";

  if (!meetingId) {
    throw new Error("process_transcript payload missing meeting_id");
  }

  const supabase = createAdminClient();

  const { data: meeting } = await supabase
    .from("meetings")
    .select("id, user_id, transcript")
    .eq("id", meetingId)
    .single();

  if (!meeting) {
    // Meeting deleted while the job was queued — nothing to retry toward.
    throw Object.assign(new Error("meeting_not_found"), { retryable: false });
  }

  // Only the fetch branch below sets status to "completed". A re-delivered
  // webhook (Recall retries, or the reconciliation sweep catching one late)
  // finds a transcript already stored, skips that branch entirely, and would
  // otherwise leave the meeting parked at "processing" forever even though
  // the work is done — exactly what happened the first time a webhook's
  // signature stopped matching and a replay landed after the fact.
  const hadTranscriptAlready = !!meeting.transcript;

  // ── Fetch (skipped if a previous attempt already got this far) ──────────
  if (!meeting.transcript) {
    // Only the bot flow can fetch; an import arrives with its transcript
    // already stored, so reaching here without a bot means the row lost its
    // transcript somehow and there is nothing to recover it from.
    if (!botId) {
      throw Object.assign(
        new Error("no transcript and no bot to fetch one from"),
        { retryable: false }
      );
    }

    const { text, segments, durationSeconds } = await getTranscript(botId);

    await supabase
      .from("meetings")
      .update({
        transcript: text,
        // Same content as `transcript`, kept in its timed form so playback can
        // follow along. Null rather than [] when timing is missing, so the UI
        // can tell "no segments" apart from "a recording with silence".
        transcript_segments: segments.length ? segments : null,
        transcript_fetched_at: new Date().toISOString(),
        recording_seconds: durationSeconds,
        status: text.trim() ? "completed" : "failed",
        error: text.trim() ? null : "Recall returned an empty transcript",
      })
      .eq("id", meetingId);

    // Meter as it happens. Recall bills per hour, so this can't wait for an
    // invoice to reveal it.
    if (durationSeconds && durationSeconds > 0) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("recording_seconds_used")
        .eq("id", meeting.user_id)
        .single();

      await supabase
        .from("profiles")
        .update({
          recording_seconds_used:
            (profile?.recording_seconds_used ?? 0) + durationSeconds,
        })
        .eq("id", meeting.user_id);
    }

    if (!text.trim()) {
      // Nothing was said, or transcription failed. Not worth retrying.
      throw Object.assign(new Error("empty_transcript"), { retryable: false });
    }
  }

  // ── Triage → deal → draft proposal ─────────────────────────────────────
  const result = await dealFromTranscript(meetingId, source);

  if (hadTranscriptAlready) {
    // Heal the status the fetch branch would have set, without stomping a
    // status something else may have written concurrently (e.g. "failed").
    await supabase
      .from("meetings")
      .update({ status: "completed" })
      .eq("id", meetingId)
      .in("status", ["processing", "recording", "bot_scheduled"]);
  }

  console.log(
    `[cron/worker] meeting ${meetingId}: ${result.kind}` +
      (result.dealId ? ` → deal ${result.dealId}` : "") +
      (result.skippedReason ? ` (${result.skippedReason})` : "")
  );
}

/**
 * Writes the starter proposal — the reusable foundation generated straight
 * from onboarding, before any client conversation exists.
 *
 * Runs behind the queue rather than inside the onboarding request because the
 * person must not wait on it: they answer the calendar question while this
 * runs, and the proposal appears in the workspace when it lands.
 *
 * Every state transition is written to the row, because that row is what the
 * UI polls. A silent failure here would leave someone staring at "being
 * generated" indefinitely, which is the specific outcome the state machine
 * exists to prevent.
 */
async function runStarterProposal(job: ClaimedJob) {
  const userId = job.payload.user_id as string;
  const proposalId = job.payload.proposal_id as string;

  if (!userId || !proposalId) {
    throw Object.assign(
      new Error("starter_proposal payload missing user_id or proposal_id"),
      { retryable: false }
    );
  }

  const supabase = createAdminClient();

  const setState = async (
    state: GenerationState,
    extraMeta: Record<string, unknown> = {}
  ) => {
    const { data: row } = await supabase
      .from("proposals")
      .select("generation_meta")
      .eq("id", proposalId)
      .maybeSingle();

    await supabase
      .from("proposals")
      .update({
        generation_state: state,
        generation_meta: {
          ...((row?.generation_meta as Record<string, unknown>) ?? {}),
          ...extraMeta,
        },
      })
      .eq("id", proposalId);
  };

  try {
    await setState("processing_profile");

    const spec = await latestSpecification(supabase, userId);
    const facts = await latestFacts(supabase, userId);

    if (!spec || !facts) {
      // Onboarding was never completed, or its records were removed. Retrying
      // cannot conjure them.
      await setState("failed_terminal", { failure: "no_specification" });
      throw Object.assign(new Error("no specification for user"), {
        retryable: false,
      });
    }

    await setState("processing_document");
    const result = await generateStarterProposal(facts, spec.spec);

    await setState("validating");

    const { error } = await supabase
      .from("proposals")
      .update({
        proposal_data: result.proposal,
        generation_state: result.quality.ready_for_human_review
          ? "ready_for_review"
          : "needs_input",
      })
      .eq("id", proposalId);

    if (error) throw new Error(`starter proposal save failed: ${error.message}`);

    await setState(
      result.quality.ready_for_human_review ? "ready_for_review" : "needs_input",
      {
        model_request_id: result.requestId,
        quality: result.quality,
        generated_at: new Date().toISOString(),
      }
    );
  } catch (err) {
    // One more attempt left means the person should see a retry, not a dead
    // end. The last attempt is where it becomes terminal.
    const lastAttempt = job.attempts + 1 >= job.max_attempts;
    await setState(lastAttempt ? "failed_terminal" : "failed_retryable", {
      failure: err instanceof Error ? err.message : String(err),
      failed_at: new Date().toISOString(),
    });
    throw err;
  }
}

/* ── Follow-up sweep ──────────────────────────────────────────────────────
   Periodic rather than queued: there is no external event that says "this
   deal has now been quiet for ten days", so something has to look.         */

/** Accounts whose rules have not run in this long are due another sweep. */
const SWEEP_INTERVAL_HOURS = 6;

/**
 * Accounts per tick. One sweep makes a dozen or so outbound requests including
 * up to four model drafts, so one per tick stays well inside the free plan's
 * request cap, and still reaches 360 accounts in each six-hour window.
 */
const SWEEP_BATCH = 1;


async function runFollowUpSweeps() {
  const supabase = createAdminClient();
  const cutoff = new Date(
    Date.now() - SWEEP_INTERVAL_HOURS * 3_600_000
  ).toISOString();

  // Never-swept accounts sort first, which is what a new user should get.
  const { data: due } = await supabase
    .from("profiles")
    .select("id")
    .not("onboarding_completed_at", "is", null)
    .or(`follow_ups_swept_at.is.null,follow_ups_swept_at.lt.${cutoff}`)
    .order("follow_ups_swept_at", { ascending: true, nullsFirst: true })
    .limit(SWEEP_BATCH);

  if (!due || due.length === 0) return;

  for (const profile of due) {
    const userId = profile.id as string;
    try {
      const result = await sweepFollowUps(userId);
      if (result.raised > 0) {
        console.log(
          `[cron/worker] swept ${userId}: raised ${result.raised}, drafted ${result.drafted}`
        );
      }
    } catch (err) {
      console.error(`[cron/worker] sweep failed for ${userId}:`, err);
    } finally {
      // Stamped even on failure. A user whose sweep throws every time must not
      // monopolise every tick from now on.
      await supabase
        .from("profiles")
        .update({ follow_ups_swept_at: new Date().toISOString() })
        .eq("id", userId);
    }
  }
}
