import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { field, readJson } from "@/lib/validate";

/**
 * The document's seven fields, bounded. What is saved here is what a client
 * later reads on the public page, so it is checked as carefully as anything
 * that arrives from outside.
 */
const ProposalDataSchema = z.object({
  challenge: z.string().max(10_000),
  approach: z.string().max(20_000),
  deliverables: z.array(z.string().max(2_000)).max(50),
  timeline_phased: z.string().max(10_000),
  investment_number: z.string().max(200),
  investment_terms: z.string().max(10_000),
  next_steps: z.string().max(10_000),
});

const Body = z.object({
  proposal_data: ProposalDataSchema.optional(),
  change_summary: z.string().trim().max(200).optional(),
  template_id: field.id.nullable().optional(),
});

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

  const parsed = await readJson(request, Body);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

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
