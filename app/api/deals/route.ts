import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data, error } = await supabase
    .from("deals")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return new Response(error.message, { status: 500 });
  return NextResponse.json({ deals: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  try {
    const body = await request.json();
    const insert = {
      user_id: user.id,
      client_name: body.client_name ?? null,
      client_company: body.client_company ?? null,
      client_email: body.client_email ?? null,
      transcript: body.transcript ?? null,
      pain_point: body.pain_point ?? null,
      budget_signal: body.budget_signal ?? null,
      timeline: body.timeline ?? null,
      decision_maker: body.decision_maker ?? null,
      fit_score: body.fit_score ?? null,
      proposal_data: body.proposal_data ?? null,
      suggested_replies: body.suggested_replies ?? null,
      stage: body.stage ?? "lead",
      source: body.source ?? "proposal_generator",
      notes: body.notes ?? null,
      proposed_amount: body.proposed_amount ?? null,
    };
    const { data, error } = await supabase
      .from("deals")
      .insert(insert)
      .select("id")
      .single();
    if (error) return new Response(error.message, { status: 500 });
    return NextResponse.json({ id: data.id });
  } catch (err) {
    console.error(err);
    return new Response("Bad request", { status: 400 });
  }
}
