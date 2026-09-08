import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRecordingUrl } from "@/lib/recall";

export const runtime = "nodejs";

/**
 * A fresh playback URL for a meeting's recording.
 *
 * Fetched per request rather than stored: Recall signs these for five hours,
 * so a cached one is a link that works in testing and is dead by the time a
 * user clicks it. RLS on the select is what scopes this to the owner — the
 * bot id never reaches the client.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: meeting, error } = await supabase
    .from("meetings")
    .select("recall_bot_id")
    .eq("id", id)
    .single();

  if (error || !meeting) return new Response("Meeting not found", { status: 404 });
  if (!meeting.recall_bot_id) {
    // Imported transcripts have no recording behind them. Not an error.
    return NextResponse.json({ url: null, reason: "no_recording" });
  }

  try {
    const url = await getRecordingUrl(meeting.recall_bot_id);
    return NextResponse.json({ url, reason: url ? null : "not_ready" });
  } catch (err) {
    console.error("[meetings/recording]", err);
    return NextResponse.json({ url: null, reason: "unavailable" });
  }
}
