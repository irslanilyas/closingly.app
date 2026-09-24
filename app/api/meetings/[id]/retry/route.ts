import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueue } from "@/lib/jobs";
import { nextProgress, writeProgress } from "@/lib/meetings/progress";
import { checkAiBudget, rateLimitResponse } from "@/lib/rate-limit";
import { field, readJson } from "@/lib/validate";

const Body = z.object({
  /** "It was a sales call": skip the classifier and make the deal. */
  force: z.boolean().optional(),
});

/** Each run costs up to two model calls. */
const RATE_LIMIT = { action: "meeting_retry", limit: 6, windowMinutes: 60 };

/**
 * Run a call through the pipeline again: after a failure, or to make a deal
 * from a call the classifier decided was not a sales conversation.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!field.id.safeParse(id).success) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limit = await checkAiBudget(user.id, RATE_LIMIT);
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

  const parsed = await readJson(request, Body);
  if (!parsed.ok) return parsed.response;
  const force = parsed.data.force === true;

  // Ownership through the caller's session: someone else's meeting reads as 404.
  const { data: meeting } = await supabase
    .from("meetings")
    .select("id, status, deal_id, recall_bot_id, transcript")
    .eq("id", id)
    .maybeSingle();
  if (!meeting) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (meeting.deal_id) {
    return NextResponse.json(
      { error: "already_has_deal", deal_id: meeting.deal_id },
      { status: 409 }
    );
  }
  if (meeting.status === "processing" || meeting.status === "recording") {
    return NextResponse.json({ error: "already_running" }, { status: 409 });
  }
  if (!meeting.transcript && !meeting.recall_bot_id) {
    return NextResponse.json({ error: "nothing_to_read" }, { status: 400 });
  }

  // Status and progress are server-owned columns.
  const admin = createAdminClient();
  await admin.from("meetings").update({ status: "processing", error: null }).eq("id", id);
  await writeProgress(admin, id, nextProgress(null, meeting.transcript ? "reading" : "queued"));

  await enqueue(
    "process_transcript",
    {
      meeting_id: id,
      ...(meeting.recall_bot_id ? { bot_id: meeting.recall_bot_id } : { source: "imported" }),
      force,
    },
    { dedupeKey: `retry:${id}` }
  );

  return NextResponse.json({ ok: true });
}
