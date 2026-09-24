import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { field, readJson } from "@/lib/validate";


const SNOOZE_PRESETS: Record<string, number> = {
  tomorrow: 1,
  three_days: 3,
  next_week: 7,
  two_weeks: 14,
};

const PatchBody = z.object({
  action: z.enum(["snooze", "dismiss", "done", "reopen", "save_draft"]),
  snooze: z.string().max(20).optional(),
  draft_subject: z.string().max(300).optional(),
  draft_body: z.string().max(20_000).optional(),
});

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

  if (!field.id.safeParse(id).success) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const parsed = await readJson(request, PatchBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

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
      patch.draft_subject = body.draft_subject ?? "";
      patch.draft_body = body.draft_body;
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
  if (!field.id.safeParse(id).success) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
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
