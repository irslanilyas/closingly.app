import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { claimJobs, completeJob, failJob, type ClaimedJob } from "@/lib/jobs";
import { getTranscript, TranscriptNotReadyError } from "@/lib/recall";
import { dealFromTranscript } from "@/lib/pipeline/from-transcript";

export const maxDuration = 60;

/**
 * Drains the job queue. Invoked by Vercel Cron every minute, and callable by
 * hand during development.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = await claimJobs(5);
  if (jobs.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  const results: Array<{ id: string; kind: string; ok: boolean }> = [];

  for (const job of jobs) {
    try {
      switch (job.kind) {
        case "process_transcript":
          await processTranscript(job);
          break;
        default:
          throw new Error(`Unknown job kind: ${job.kind}`);
      }
      await completeJob(job.id);
      results.push({ id: job.id, kind: job.kind, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[cron/worker] ${job.kind} failed:`, message);

      await failJob(job, message, { retryable: isRetryable(err) });
      results.push({ id: job.id, kind: job.kind, ok: false });
    }
  }

  return NextResponse.json({ processed: jobs.length, results });
}

/**
 * Retry transient failures; give up on structural ones.
 *
 * Default is *not* retryable. A malformed prompt or a schema mismatch fails
 * identically every time, and retrying it three times just triples the token
 * bill for the same error.
 */
function isRetryable(err: unknown): boolean {
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

/**
 * Fetch a finished meeting's transcript, then turn it into a deal.
 *
 * Split into two halves deliberately: once the transcript is stored, a failure
 * in the AI half must not cause the transcript to be re-fetched from Recall on
 * retry. The transcript is the expensive, once-only artefact.
 */
async function processTranscript(job: ClaimedJob) {
  const meetingId = job.payload.meeting_id as string;
  const botId = job.payload.bot_id as string;

  if (!meetingId || !botId) {
    throw new Error("process_transcript payload missing meeting_id or bot_id");
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

  // ── Fetch (skipped if a previous attempt already got this far) ──────────
  if (!meeting.transcript) {
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
  const result = await dealFromTranscript(meetingId);

  console.log(
    `[cron/worker] meeting ${meetingId}: ${result.kind}` +
      (result.dealId ? ` → deal ${result.dealId}` : "") +
      (result.skippedReason ? ` (${result.skippedReason})` : "")
  );
}
