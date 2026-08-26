import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ProposalData } from "@/lib/types";

/** Save an edited proposal, snapshotting the previous version first. */
export async function PATCH(
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

  const body = (await request.json()) as {
    proposal_data?: ProposalData;
    change_summary?: string;
    template_id?: string | null;
  };

  // Switching template changes how the proposal looks, not what it says, so it
  // skips the version snapshot below — design churn in the history panel would
  // bury the content edits it exists to let you undo.
  if (body.proposal_data === undefined && body.template_id !== undefined) {
    const { error } = await supabase
      .from("proposals")
      .update({ template_id: body.template_id })
      .eq("id", id);

    if (error) {
      console.error("[proposals] template change failed:", error);
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }

    return NextResponse.json({ id, template_id: body.template_id });
  }

  if (!body.proposal_data) {
    return NextResponse.json({ error: "missing_proposal_data" }, { status: 400 });
  }

  // RLS scopes this to the caller's own proposals.
  const { data: current, error: readError } = await supabase
    .from("proposals")
    .select("id, proposal_data")
    .eq("id", id)
    .single();

  if (readError || !current) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Snapshot before overwriting — this is what makes an edit undoable.
  await supabase.from("proposal_versions").insert({
    proposal_id: id,
    proposal_data: current.proposal_data,
    change_summary: body.change_summary ?? "Edited",
    created_by: "user",
  });

  const { error } = await supabase
    .from("proposals")
    .update({ proposal_data: body.proposal_data })
    .eq("id", id);

  if (error) {
    console.error("[proposals] update failed:", error);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ id, proposal_data: body.proposal_data });
}
