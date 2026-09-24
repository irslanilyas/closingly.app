import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { field, readJson } from "@/lib/validate";
import type { ProposalData } from "@/lib/types";

/** Edit history, newest first. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // RLS on proposal_versions checks ownership through the parent proposal.
  const { data, error } = await supabase
    .from("proposal_versions")
    .select("id, proposal_data, change_summary, created_by, created_at")
    .eq("proposal_id", id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }

  return NextResponse.json({ versions: data ?? [] });
}

/** Restore a previous version. The current state is snapshotted first. */
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJson(request, z.object({ version_id: field.id }));
  if (!body.ok) return body.response;
  const { version_id } = body.data;

  const [{ data: version }, { data: current }] = await Promise.all([
    supabase
      .from("proposal_versions")
      .select("proposal_data")
      .eq("id", version_id)
      .eq("proposal_id", id)
      .single(),
    supabase.from("proposals").select("proposal_data").eq("id", id).single(),
  ]);

  if (!version || !current) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Restoring is itself an edit — snapshot first so undo stays available.
  await supabase.from("proposal_versions").insert({
    proposal_id: id,
    proposal_data: current.proposal_data,
    change_summary: "Before restore",
    created_by: "user",
  });

  const { error } = await supabase
    .from("proposals")
    .update({ proposal_data: version.proposal_data })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "restore_failed" }, { status: 500 });
  }

  return NextResponse.json({
    proposal_data: version.proposal_data as ProposalData,
  });
}
