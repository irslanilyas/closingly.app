import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data, error } = await supabase
    .from("deals")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return new Response(error.message, { status: 404 });
  return NextResponse.json({ deal: data });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  try {
    const body = await request.json();
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    const allowed = [
      "client_name",
      "client_company",
      "client_email",
      "pain_point",
      "budget_signal",
      "timeline",
      "decision_maker",
      "fit_score",
      "stage",
      "proposed_amount",
      "estimated_hours",
      "start_date",
      "target_end_date",
      "competitor_mentioned",
      "competitive_note",
    ];
    for (const k of allowed) {
      if (k in body) update[k] = body[k];
    }
    const { error } = await supabase.from("deals").update(update).eq("id", id);
    if (error) return new Response(error.message, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return new Response("Bad request", { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { error } = await supabase.from("deals").delete().eq("id", id);
  if (error) return new Response(error.message, { status: 500 });
  return NextResponse.json({ ok: true });
}
