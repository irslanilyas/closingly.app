import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scheduleBot, cancelBot } from "@/lib/recall";

/** Join a minute early so the bot is already present when people arrive. */
const JOIN_LEAD_MS = 60_000;

/**
 * Below this much remaining allowance, don't schedule at all. Recall would
 * cut the bot off almost as soon as it joined — the meeting looks "recorded"
 * but the transcript is too short to be useful, and the user has no way to
 * tell that in advance from the toggle.
 */
const MIN_USEFUL_RECORDING_SECONDS = 5 * 60;

/**
 * Turn the meeting agent on or off.
 *
 * Enabling schedules a Recall bot with `join_at`; disabling cancels it. The
 * recording allowance is checked before scheduling — Recall bills per hour, so
 * the cap has to be enforced before the bot exists, not after.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { enabled } = (await request.json()) as { enabled?: boolean };
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // RLS restricts this to the caller's own meetings, so a mismatched id
  // returns no rows rather than touching someone else's meeting.
  const { data: meeting, error: readError } = await supabase
    .from("meetings")
    .select("id, meet_link, starts_at, status, recall_bot_id")
    .eq("id", id)
    .single();

  if (readError || !meeting) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Ownership is proven by the read above. Every write below goes through the
  // service client instead of the caller's session, because the columns it
  // sets (the bot id and the recording status) are not the user's to set: the
  // database refuses them from a browser session. A bot id is global across
  // every customer's Recall bots, so a user able to write one onto their own
  // meeting could have the worker fetch someone else's call into it.
  const admin = createAdminClient();

  // ── Disabling ──────────────────────────────────────────────────────────
  if (!enabled) {
    if (meeting.recall_bot_id) {
      try {
        await cancelBot(meeting.recall_bot_id);
      } catch (err) {
        // A bot that already joined can't be cancelled. Don't block the user
        // from flipping the switch off — the recording just runs its course.
        console.error("[meetings/agent] cancel failed:", err);
      }
    }

    await admin
      .from("meetings")
      .update({
        agent_enabled: false,
        recall_bot_id: null,
        status: "scheduled",
        error: null,
      })
      .eq("id", id)
      .eq("user_id", user.id);

    return NextResponse.json({ id, agent_enabled: false });
  }

  // ── Enabling ───────────────────────────────────────────────────────────
  if (!meeting.meet_link) {
    return NextResponse.json({ error: "no_meeting_link" }, { status: 400 });
  }

  if (!meeting.starts_at || new Date(meeting.starts_at) < new Date()) {
    return NextResponse.json({ error: "meeting_passed" }, { status: 400 });
  }

  // Check the allowance before creating anything billable.
  const { data: profile } = await admin
    .from("profiles")
    .select("recording_seconds_used, recording_seconds_limit")
    .eq("id", user.id)
    .single();

  const remainingSeconds = profile
    ? profile.recording_seconds_limit - profile.recording_seconds_used
    : null;

  if (remainingSeconds !== null && remainingSeconds <= 0) {
    return NextResponse.json({ error: "allowance_exhausted" }, { status: 403 });
  }

  if (
    remainingSeconds !== null &&
    remainingSeconds < MIN_USEFUL_RECORDING_SECONDS
  ) {
    // Enough allowance to pass the check above, not enough to record anything
    // worth having. Scheduling here would join, record a few minutes, and get
    // cut off by Recall — a confusing half-empty transcript instead of a
    // clear "you're basically out" message up front.
    return NextResponse.json(
      { error: "allowance_too_low", remaining_seconds: remainingSeconds },
      { status: 403 }
    );
  }

  // Already scheduled — nothing to do, and re-scheduling would orphan a bot.
  if (meeting.recall_bot_id) {
    await admin
      .from("meetings")
      .update({ agent_enabled: true })
      .eq("id", id)
      .eq("user_id", user.id);
    return NextResponse.json({ id, agent_enabled: true });
  }

  const joinAt = new Date(
    Math.max(
      Date.now() + 5_000,
      new Date(meeting.starts_at).getTime() - JOIN_LEAD_MS
    )
  ).toISOString();

  try {
    const { botId } = await scheduleBot({
      meetingUrl: meeting.meet_link,
      joinAt,
      // Undefined when there's no profile row (falls through to no cap) —
      // every real profile has a limit, so this only matters for a row that
      // doesn't exist yet, which allowance_exhausted above would already
      // have caught if it had a limit of 0.
      maxRecordingSeconds: remainingSeconds ?? undefined,
    });

    const { error } = await admin
      .from("meetings")
      .update({
        agent_enabled: true,
        recall_bot_id: botId,
        status: "bot_scheduled",
        error: null,
      })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      // The bot exists but we couldn't record it, so nothing would ever match
      // the webhook. Cancel rather than leave a bot we can't attribute.
      await cancelBot(botId).catch(() => {});
      throw error;
    }

    return NextResponse.json({ id, agent_enabled: true, bot_id: botId });
  } catch (err) {
    console.error("[meetings/agent] schedule failed:", err);
    return NextResponse.json({ error: "schedule_failed" }, { status: 502 });
  }
}
