import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";


const ALLOWED = ["connected", "skipped", "pending"] as const;
type CalendarStatus = (typeof ALLOWED)[number];

/**
 * Records the calendar decision.
 *
 * A preference, never a gate: `skipped` means Closingly stops surfacing
 * upcoming calls, not that anything stops working. Separate from the main
 * onboarding write because it is also how someone changes their mind later
 * from Account.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let status: unknown;
  try {
    ({ status } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof status !== "string" || !ALLOWED.includes(status as CalendarStatus)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({ calendar_status: status })
    .eq("id", user.id);

  if (error) {
    console.error("[onboarding/calendar] update failed:", error.message);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
