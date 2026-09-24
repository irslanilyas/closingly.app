import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/google/auth";
import { fetchCalendarEvents, normaliseEvents } from "@/lib/google/calendar";

/** How far ahead to sync. Beyond this, meetings usually move anyway. */
const SYNC_WINDOW_DAYS = 30;

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = await getValidAccessToken(user.id);
  if (!accessToken) {
    // Distinct from a transient failure — the grant is gone and the user has
    // to reconnect, so the UI should say so rather than offer "retry".
    return NextResponse.json(
      { error: "google_disconnected" },
      { status: 400 }
    );
  }

  try {
    const timeMin = new Date().toISOString();
    const timeMax = new Date(
      Date.now() + SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const events = normaliseEvents(
      await fetchCalendarEvents(accessToken, timeMin, timeMax)
    );

    if (events.length === 0) {
      return NextResponse.json({ synced: 0, with_links: 0 });
    }

    // Upsert on (user_id, google_event_id). Only the fields Google owns are
    // sent, so a re-sync can't clobber our own state — agent_enabled,
    // recall_bot_id, status, transcript and deal_id are all left untouched.
    // The user is part of the key because every guest on a Google event sees
    // the same event id: two Closingly users on one call each get their own
    // row instead of colliding on the other's.
    const { error } = await supabase.from("meetings").upsert(
      events.map((e) => ({
        user_id: user.id,
        google_event_id: e.google_event_id,
        title: e.title,
        starts_at: e.starts_at,
        ends_at: e.ends_at,
        attendees: e.attendees,
        meet_link: e.meet_link,
        platform: e.platform,
        event_type: e.event_type,
        is_call: e.is_call,
        not_call_reason: e.not_call_reason,
      })),
      { onConflict: "user_id,google_event_id" }
    );

    if (error) {
      console.error("[calendar/sync] upsert failed:", error);
      return NextResponse.json({ error: "sync_failed" }, { status: 500 });
    }

    return NextResponse.json({
      synced: events.length,
      calls: events.filter((e) => e.is_call).length,
      with_links: events.filter((e) => e.meet_link).length,
    });
  } catch (err) {
    console.error("[calendar/sync] failed:", err);
    return NextResponse.json({ error: "sync_failed" }, { status: 500 });
  }
}
