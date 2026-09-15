import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendGmail, GmailError } from "@/lib/google/gmail";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Sending is the one irreversible action in the whole queue, so it is a
 * dedicated endpoint rather than another `action` on PATCH. It rate limits
 * separately, it reads the body from the request rather than the row (the
 * person may have edited it in the composer and not saved), and it records
 * what was actually sent.
 */
const RATE_LIMIT = { action: "follow_up_send", limit: 40, windowMinutes: 60 };

export async function POST(
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

  const limit = await checkRateLimit(user.id, RATE_LIMIT);
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

  const body = (await request.json().catch(() => ({}))) as {
    subject?: string;
    body?: string;
    to?: string;
  };

  const { data: item } = await supabase
    .from("follow_ups")
    .select(
      "id, deal_id, draft_subject, draft_body, status, deals ( client_email, client_name, client_company )"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!item) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (item.status === "sent") {
    // Guards the double-click and the impatient refresh. Sending the same
    // message to a client twice is the kind of mistake that costs the deal.
    return NextResponse.json({ error: "already_sent" }, { status: 409 });
  }

  const deal = (Array.isArray(item.deals) ? item.deals[0] : item.deals) as
    | { client_email: string | null; client_name: string | null; client_company: string | null }
    | null;

  const to = (body.to ?? deal?.client_email ?? "").trim();
  const subject = (body.subject ?? item.draft_subject ?? "").trim();
  const text = (body.body ?? item.draft_body ?? "").trim();

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ error: "no_recipient" }, { status: 400 });
  }
  if (!subject || !text) {
    return NextResponse.json({ error: "empty_message" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  try {
    await sendGmail(user.id, {
      to,
      subject,
      body: text,
      from: user.email ?? "",
      fromName: (profile?.full_name as string | null) ?? null,
    });
  } catch (err) {
    const message =
      err instanceof GmailError
        ? err.message
        : "Couldn't send through Gmail. Try again, or copy the message and send it yourself.";
    const status = err instanceof GmailError && err.status === 401 ? 401 : 502;
    return NextResponse.json({ error: "send_failed", message }, { status });
  }

  const now = new Date().toISOString();

  await supabase
    .from("follow_ups")
    .update({
      status: "sent",
      sent_at: now,
      sent_via: "gmail",
      draft_subject: subject,
      draft_body: text,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (item.deal_id) {
    await supabase.from("deal_events").insert({
      deal_id: item.deal_id,
      user_id: user.id,
      kind: "followup_generated",
      to_value: subject.slice(0, 200),
    });
  }

  return NextResponse.json({ ok: true, sent_at: now });
}
