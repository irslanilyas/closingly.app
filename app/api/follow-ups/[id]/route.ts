import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const SNOOZE_PRESETS: Record<string, number> = {
  tomorrow: 1,
  three_days: 3,
  next_week: 7,
  two_weeks: 14,
};

/**
 * Snooze, dismiss, complete, or edit the draft.
 *
 * Dismissing is permanent for that situation: the dedupe index only covers
 * open and snoozed rows, so a dismissed item stays dismissed until the
 * underlying thing changes enough to produce a different key. That is the
 * behaviour people expect from a queue and rarely get.
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
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    snooze?: string;
    draft_subject?: string;
    draft_body?: string;
  };

  const patch: Record<string, unknown> = {};

  switch (body.action) {
    case "snooze": {
      const days = SNOOZE_PRESETS[body.snooze ?? "three_days"];
      if (!days) {
        return NextResponse.json({ error: "invalid_snooze" }, { status: 400 });
      }
      patch.status = "snoozed";
      patch.snoozed_until = new Date(
        Date.now() + days * 86_400_000
      ).toISOString();
      break;
    }
    case "dismiss":
      patch.status = "dismissed";
      break;
    case "done":
      patch.status = "done";
      break;
    case "reopen":
      patch.status = "open";
      patch.snoozed_until = null;
      break;
    case "save_draft": {
      if (typeof body.draft_body !== "string") {
        return NextResponse.json({ error: "invalid_draft" }, { status: 400 });
      }
      patch.draft_subject = (body.draft_subject ?? "").slice(0, 300);
      patch.draft_body = body.draft_body.slice(0, 20_000);
      patch.drafted_at = new Date().toISOString();
      break;
    }
    default:
      return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  }

  // Scoped by user_id as well as id: RLS already enforces this, and saying it
  // twice costs nothing.
  const { error } = await supabase
    .from("follow_ups")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[follow-ups] update failed:", error.message);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await supabase.from("follow_ups").delete().eq("id", id).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
