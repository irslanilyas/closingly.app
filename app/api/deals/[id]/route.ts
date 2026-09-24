import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { field, readJson } from "@/lib/validate";
import { STAGE_ORDER, type DealStage } from "@/lib/types";

/**
 * One deal: read, edit, delete.
 *
 * Every query runs through the caller's session, so row-level security scopes
 * it to their own deals: someone else's id matches no row and reads as 404.
 * Database errors are logged here and never returned, since their text can
 * name tables, columns and constraints.
 */

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

const unauthorized = () =>
  NextResponse.json({ error: "unauthorized" }, { status: 401 });

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!field.id.safeParse(id).success) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { supabase, user } = await signedIn();
  if (!user) return unauthorized();

  const { data, error } = await supabase
    .from("deals")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[deals/get] read failed:", error.message);
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ deal: data });
}

/**
 * The fields a person may edit, and nothing else. Unknown keys are dropped, so
 * the transcript, source and ownership columns cannot be written through here.
 */
const DealPatch = z
  .object({
    client_name: field.text(200).nullable(),
    client_company: field.text(200).nullable(),
    client_email: z
      .union([z.email().max(320), z.literal(""), z.null()])
      .transform((value) => value || null),
    pain_point: field.text(4000).nullable(),
    budget_signal: field.text(1000).nullable(),
    timeline: field.text(1000).nullable(),
    decision_maker: field.text(500).nullable(),
    fit_score: z.number().int().min(0).max(10).nullable(),
    stage: z.enum(STAGE_ORDER as [DealStage, ...DealStage[]]),
    proposed_amount: field.money.nullable(),
    estimated_hours: z.number().finite().min(0).max(100_000).nullable(),
    start_date: field.isoDate.nullable(),
    target_end_date: field.isoDate.nullable(),
    competitor_mentioned: field.text(200).nullable(),
    competitive_note: field.text(2000).nullable(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Nothing to update",
  });

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!field.id.safeParse(id).success) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { supabase, user } = await signedIn();
  if (!user) return unauthorized();

  const body = await readJson(request, DealPatch);
  if (!body.ok) return body.response;

  const { data, error } = await supabase
    .from("deals")
    .update({ ...body.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[deals/patch] update failed:", error.message);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!field.id.safeParse(id).success) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { supabase, user } = await signedIn();
  if (!user) return unauthorized();

  const { error } = await supabase.from("deals").delete().eq("id", id);
  if (error) {
    console.error("[deals/delete] delete failed:", error.message);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
