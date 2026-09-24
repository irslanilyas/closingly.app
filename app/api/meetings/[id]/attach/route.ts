import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { field, readJson } from "@/lib/validate";

const Body = z.object({ deal_id: field.id });

/**
 * File a call under a deal that already exists: the usual home for a
 * check-in, which the pipeline deliberately does not turn into a new deal.
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

  const parsed = await readJson(request, Body);
  if (!parsed.ok) return parsed.response;

  // Both reads go through the caller's session, so both must be theirs.
  const [{ data: meeting }, { data: deal }] = await Promise.all([
    supabase.from("meetings").select("id, title").eq("id", id).maybeSingle(),
    supabase.from("deals").select("id").eq("id", parsed.data.deal_id).maybeSingle(),
  ]);
  if (!meeting || !deal) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // The deal link is server-owned (not in the session's column grants).
  const { error } = await createAdminClient()
    .from("meetings")
    .update({ deal_id: deal.id })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    console.error("[meetings/attach] failed:", error.message);
    return NextResponse.json({ error: "attach_failed" }, { status: 500 });
  }

  await supabase.from("deal_events").insert({
    deal_id: deal.id,
    user_id: user.id,
    kind: "meeting_recorded",
    to_value: meeting.title ?? "Call",
    metadata: { meeting_id: id, attached: true },
  });

  return NextResponse.json({ ok: true, deal_id: deal.id });
}
