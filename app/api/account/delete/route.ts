import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelBot } from "@/lib/recall";

export const maxDuration = 30;

/**
 * Permanently delete the caller's own account and everything in it.
 *
 * Every table in the schema chains back to `profiles.id`, which is itself
 * `references auth.users(id) on delete cascade` — verified directly against
 * the live schema before writing this, not assumed. One
 * `auth.admin.deleteUser()` call is genuinely sufficient; there is no
 * second table anywhere that needs a manual cleanup pass.
 *
 * The one thing cascade *can't* reach: a Recall bot already dispatched for a
 * meeting. It keeps recording (and billing) on Recall's side regardless of
 * whether the meeting row that was going to receive its transcript still
 * exists, so any live bot is cancelled first.
 *
 * Always operates on the caller's own id from their session — never on an id
 * passed in the request. There is no path here by which one account can
 * delete another.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: liveMeetings } = await admin
    .from("meetings")
    .select("recall_bot_id")
    .eq("user_id", user.id)
    .not("recall_bot_id", "is", null)
    .in("status", ["bot_scheduled", "recording", "processing"]);

  for (const meeting of liveMeetings ?? []) {
    if (meeting.recall_bot_id) {
      // Best-effort — a bot that already finished can't be cancelled (404),
      // and that's fine: it has nothing left to do anyway.
      await cancelBot(meeting.recall_bot_id).catch((err) => {
        console.error("[account/delete] bot cancel failed:", err);
      });
    }
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);

  if (error) {
    console.error("[account/delete] deleteUser failed:", error);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
