import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { field, readJson } from "@/lib/validate";

const CreateBody = z.object({
  deal_id: field.id.nullish(),
  // The rules name the kind when the page raises one they suggested; anything
  // typed by hand is "custom".
  kind: z
    .enum(["nudge", "proposal_chase", "unanswered_question", "check_in", "scope_risk", "custom"])
    .default("custom"),
  reason: z.string().trim().min(3).max(400),
  due_at: z.iso.datetime({ offset: true }).optional(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
});


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

  const parsed = await readJson(request, CreateBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const { reason, priority } = body;

  // A foreign key only proves the deal exists, not whose it is. Read it through
  // the caller's session first, so a follow-up can only ever hang off their
  // own deal.
  if (body.deal_id) {
    const { data: deal } = await supabase
      .from("deals")
      .select("id")
      .eq("id", body.deal_id)
      .maybeSingle();
    if (!deal) {
      return NextResponse.json({ error: "deal_not_found" }, { status: 404 });
    }
  }

  const { data, error } = await supabase
    .from("follow_ups")
    .insert({
      user_id: user.id,
      deal_id: body.deal_id ?? null,
      kind: body.kind,
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
