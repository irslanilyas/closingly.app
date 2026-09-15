import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * The queue.
 *
 * Returns open work joined to just enough of the deal to render a row without
 * a second round trip. Snoozed items whose time has come are promoted here
 * rather than by a background job: the queue is read far more often than it is
 * swept, and a snooze that only expires on a cron tick feels broken.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const status = request.nextUrl.searchParams.get("status") ?? "open";
  const now = new Date().toISOString();

  // Wake anything whose snooze has run out.
  await supabase
    .from("follow_ups")
    .update({ status: "open", snoozed_until: null })
    .eq("user_id", user.id)
    .eq("status", "snoozed")
    .lte("snoozed_until", now);

  let query = supabase
    .from("follow_ups")
    .select(
      `id, deal_id, kind, status, reason, priority, due_at, snoozed_until,
       draft_subject, draft_body, drafted_at, sent_at, sent_via, source, created_at,
       deals ( id, client_name, client_company, client_email, stage, proposed_amount )`
    )
    .eq("user_id", user.id);

  query =
    status === "all"
      ? query.order("created_at", { ascending: false })
      : status === "done"
        ? query
            .in("status", ["sent", "done", "dismissed"])
            .order("updated_at", { ascending: false })
        : query
            .eq("status", status)
            .order("priority", { ascending: true })
            .order("due_at", { ascending: true });

  const { data, error } = await query.limit(100);

  if (error) {
    console.error("[follow-ups] list failed:", error.message);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  return NextResponse.json({ follow_ups: data ?? [] });
}

/** Add one by hand, from a deal page or the queue's own composer. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    deal_id?: string;
    reason?: string;
    due_at?: string;
    priority?: number;
  };

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 3 || reason.length > 400) {
    return NextResponse.json({ error: "invalid_reason" }, { status: 400 });
  }

  const priority =
    body.priority === 1 || body.priority === 2 || body.priority === 3
      ? body.priority
      : 2;

  const { data, error } = await supabase
    .from("follow_ups")
    .insert({
      user_id: user.id,
      deal_id: body.deal_id ?? null,
      kind: "custom",
      reason,
      priority,
      due_at: body.due_at ?? new Date().toISOString(),
      source: "manual",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[follow-ups] create failed:", error.message);
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
