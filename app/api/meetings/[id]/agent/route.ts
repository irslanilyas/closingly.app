import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scheduleBot, cancelBot } from "@/lib/recall";

/** Join a minute early so the bot is already present when people arrive. */
const JOIN_LEAD_MS = 60_000;

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

    await supabase
      .from("meetings")
      .update({
        agent_enabled: false,
        recall_bot_id: null,
        status: "scheduled",
        error: null,
      })
      .eq("id", id);

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
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("recording_seconds_used, recording_seconds_limit")
    .eq("id", user.id)
    .single();

  if (
    profile &&
    profile.recording_seconds_used >= profile.recording_seconds_limit
  ) {
    return NextResponse.json({ error: "allowance_exhausted" }, { status: 403 });
  }

  // Already scheduled — nothing to do, and re-scheduling would orphan a bot.
  if (meeting.recall_bot_id) {
    await supabase
      .from("meetings")
      .update({ agent_enabled: true })
      .eq("id", id);
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
    });

    const { error } = await supabase
      .from("meetings")
      .update({
        agent_enabled: true,
        recall_bot_id: botId,
        status: "bot_scheduled",
        error: null,
      })
      .eq("id", id);

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
