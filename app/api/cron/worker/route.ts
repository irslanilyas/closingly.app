import { after, NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueue, claimJobs, completeJob, failJob, type ClaimedJob } from "@/lib/jobs";
import { getBotStatus, getTranscript } from "@/lib/recall";
import { dealFromTranscript } from "@/lib/pipeline/from-transcript";
import { isRetryable } from "@/lib/retry";

export const maxDuration = 60;

/**
 * A non-terminal meeting whose row hasn't moved in this long gets checked
 * directly against Recall. Short enough to catch a dropped webhook within a
 * few worker ticks; long enough not to fight the webhook's own 20s processing
 * delay or flag a meeting that's still genuinely in progress.
 */
const STALE_MINUTES = 5;

/** How many stale meetings to reconcile per tick — keep each request cheap. */
const RECONCILE_LIMIT = 10;

/**
 * Drains the job queue.
 *
 * Claims due jobs, acknowledges immediately, then processes them after the
 * response is sent. Called every minute by an external scheduler; the daily
 * Vercel cron in vercel.json is a safety net for when that scheduler is down.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = await claimJobs(5);

  // Respond before doing the work. A transcript job takes 30-60s, but the
  // schedulers that call this cap their request timeout well below that
  // (cron-job.org's free tier stops at 30s) and disable jobs that keep
  // "failing". The work is unaffected by the connection closing, so there is
  // no reason to hold it open — the same reasoning as the Recall webhook.
  after(async () => {
    for (const job of jobs) {
      await runJob(job);
    }
    // Runs every tick, not just when jobs were claimed — a dropped webhook
    // leaves nothing in the queue to claim in the first place.
    await reconcileStaleMeetings();
  });

  if (jobs.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  return NextResponse.json({
    accepted: jobs.length,
    ids: jobs.map((j) => j.id),
  });
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

    const { text, durationSeconds } = await getTranscript(botId);

    await supabase
      .from("meetings")
      .update({
        transcript: text,
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
