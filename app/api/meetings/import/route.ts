import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { enqueue } from "@/lib/jobs";
import { createAdminClient } from "@/lib/supabase/admin";
import { nextProgress, writeProgress } from "@/lib/meetings/progress";
import { readJson } from "@/lib/validate";
import { checkAiBudget, rateLimitResponse } from "@/lib/rate-limit";


/** Same floor the pipeline itself enforces — fail here with a clear message
 *  rather than accepting the paste and silently producing nothing. */
const MIN_TRANSCRIPT_CHARS = 200;

/** Roughly a 3-hour call. Past this it's a paste accident, not a transcript. */
const MAX_TRANSCRIPT_CHARS = 400_000;

const ImportBody = z.object({
  transcript: z.string().max(MAX_TRANSCRIPT_CHARS * 2),
  title: z.string().max(500).optional(),
});

/** Each import costs two AI calls once the worker picks it up. */
const RATE_LIMIT = { action: "meeting_import", limit: 20, windowMinutes: 60 };

/**
 * Bring in a call the agent didn't record.
 *
 * Deliberately does *not* run the extraction inline. It creates the meeting
 * row, enqueues the same `process_transcript` job the Recall webhook enqueues,
 * and returns — so an import gets the retry/back-off, the idempotency and the
 * reconciliation sweep the bot flow already has, for free. It also means the
 * two paths can't drift: there is exactly one implementation of
 * "transcript → deal", and both doors open onto it.
 *
 * The visible cost is that a deal appears about a minute later rather than
 * instantly, which is why the UI shows the meeting as Processing rather than
 * pretending to be done.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = await checkAiBudget(user.id, RATE_LIMIT);
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

  const parsed = await readJson(request, ImportBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const transcript = (body.transcript ?? "").trim();
  const title = (body.title ?? "").trim().slice(0, 200) || "Imported call";

  if (transcript.length < MIN_TRANSCRIPT_CHARS) {
    return NextResponse.json(
      { error: "transcript_too_short", min: MIN_TRANSCRIPT_CHARS },
      { status: 400 }
    );
  }

  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    return NextResponse.json(
      { error: "transcript_too_long", max: MAX_TRANSCRIPT_CHARS },
      { status: 413 }
    );
  }

  // RLS scopes the insert to the caller; user_id is taken from the session,
  // never from the request body.
  const { data: meeting, error } = await supabase
    .from("meetings")
    .insert({
      user_id: user.id,
      title,
      transcript,
      transcript_fetched_at: new Date().toISOString(),
      // `starts_at` doubles as the sort key on the meetings list. An import
      // has no real scheduled time, so "now" keeps it at the top where the
      // user just put it, instead of stranding it in an undated group.
      starts_at: new Date().toISOString(),
      status: "processing",
      agent_enabled: false,
    })
    .select("id")
    .single();

  if (error || !meeting) {
    console.error("[meetings/import] insert failed:", error?.message);
    return NextResponse.json({ error: "import_failed" }, { status: 500 });
  }

  // Progress belongs to the server (users can't write it), so it goes
  // through the service client.
  await writeProgress(createAdminClient(), meeting.id, nextProgress(null, "queued"));

  await enqueue(
    "process_transcript",
    { meeting_id: meeting.id, source: "imported" },
    // No bot id to dedupe against, so key on the meeting itself — a
    // double-submitted paste can't queue the extraction twice.
    { dedupeKey: `import:${meeting.id}` }
  );

  return NextResponse.json({ meeting_id: meeting.id, status: "processing" });
}
