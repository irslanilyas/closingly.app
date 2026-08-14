import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature } from "@/lib/webhook-signature";
import { enqueue } from "@/lib/jobs";

/**
 * Recall.ai webhook receiver.
 *
 * Deliberately does almost nothing. Recall retries on timeout, and fetching a
 * transcript plus running it through an LLM takes 30–60s — do that inline and
 * every slow meeting gets processed two or three times. So: verify, record,
 * enqueue, return. Target is well under a second.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.RECALL_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[recall/webhook] RECALL_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  // Must read the raw body — re-serialising JSON changes the bytes and the
  // signature will never match.
  const rawBody = await request.text();

  const verified = verifyWebhookSignature(rawBody, request.headers, secret);
  if (!verified.ok) {
    console.warn("[recall/webhook] rejected:", verified.reason);
    return NextResponse.json({ error: verified.reason }, { status: 401 });
  }

  let payload: { event?: string; data?: { bot?: { id?: string } } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const botId = payload.data?.bot?.id;
  const event = payload.event;

  if (!botId) {
    return NextResponse.json({ error: "missing_bot_id" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // recall_bot_id is how an inbound webhook gets attributed to a user — there
  // is no session on this request.
  const { data: meeting } = await supabase
    .from("meetings")
    .select("id, user_id, status")
    .eq("recall_bot_id", botId)
    .single();

  if (!meeting) {
    // Not ours, or the meeting was deleted. 200 so Recall stops retrying.
    console.warn(`[recall/webhook] no meeting for bot ${botId}`);
    return NextResponse.json({ received: true, matched: false });
  }

  switch (event) {
    case "bot.joining_call":
    case "bot.in_call_recording":
      await supabase
        .from("meetings")
        .update({ status: "recording" })
        .eq("id", meeting.id);
      break;

    case "bot.done":
    case "bot.call_ended":
      await supabase
        .from("meetings")
        .update({ status: "processing" })
        .eq("id", meeting.id);

      // Small delay: bot.done fires when the bot leaves, but the transcript is
      // produced asynchronously and usually isn't ready the instant we ask.
      // The job retries with back-off if it still isn't.
      await enqueue(
        "process_transcript",
        { meeting_id: meeting.id, bot_id: botId },
        { delayMs: 20_000, dedupeKey: botId }
      );
      break;

    case "bot.fatal":
      await supabase
        .from("meetings")
        .update({ status: "failed", error: "Recall reported a fatal bot error" })
        .eq("id", meeting.id);
      break;

    default:
      // Unknown or uninteresting event — acknowledge so Recall doesn't retry.
      break;
  }

  return NextResponse.json({ received: true, matched: true });
}
