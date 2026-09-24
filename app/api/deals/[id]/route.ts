import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { field, readJson } from "@/lib/validate";
import { DealPatch } from "@/lib/deal-patch";

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

  // A stage move is history the rest of the product reads ("days in stage",
  // win/loss timing), so the stage it left is captured before the write.
  const previousStage = body.data.stage
    ? ((await supabase.from("deals").select("stage").eq("id", id).maybeSingle()).data?.stage as
        | string
        | undefined)
    : undefined;

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

  if (body.data.stage && previousStage && previousStage !== body.data.stage) {
    await supabase.from("deal_events").insert({
      deal_id: id,
      user_id: user.id,
      kind: "stage_changed",
      from_value: previousStage,
      to_value: body.data.stage,
    });
  }

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
