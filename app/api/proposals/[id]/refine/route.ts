import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CLAUDE_MODEL, complete, parseJsonResponse } from "@/lib/anthropic";
import { refineProposalPrompt } from "@/lib/prompts";
import { checkAiBudget, rateLimitResponse } from "@/lib/rate-limit";
import { toProposalData } from "@/lib/proposal-data";
import type { ProposalData } from "@/lib/types";
import { readJson } from "@/lib/validate";
import { z } from "zod";

/** Iterative by design — a user refining one proposal several times in a
 * sitting is the normal case, not abuse. */
const RATE_LIMIT = { action: "proposal_refine", limit: 30, windowMinutes: 60 };

/** An edit instruction, not a document: long enough for any real request. */
const Body = z.object({ instruction: z.string().trim().min(1).max(1000) });

const PROPOSAL_KEYS: Array<keyof ProposalData> = [
  "challenge",
  "approach",
  "deliverables",
  "timeline_phased",
  "investment_number",
  "investment_terms",
  "next_steps",
];

/** Apply a plain-language instruction to a proposal. */
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

  const limit = await checkAiBudget(user.id, RATE_LIMIT);
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

  const parsed = await readJson(request, Body);
  if (!parsed.ok) return parsed.response;
  const { instruction } = parsed.data;

  const { data: proposal, error: readError } = await supabase
    .from("proposals")
    .select("id, deal_id, proposal_data")
    .eq("id", id)
    .single();

  if (readError || !proposal) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Refining a starter proposal reads the same normalised shape the editor
  // shows, so the model is never handed a schema the prompt does not describe.
  const before = toProposalData(proposal.proposal_data);

  try {
    const refined = parseJsonResponse<ProposalData>(
      await complete({
        model: CLAUDE_MODEL,
        prompt: refineProposalPrompt(
          JSON.stringify(before, null, 2),
          instruction.trim()
        ),
        maxTokens: 4096,
      })
    );

    // A model that drops a key would silently delete a section of the
    // proposal. Fill any gap from the original rather than losing content.
    const merged = { ...before } as ProposalData;
    for (const key of PROPOSAL_KEYS) {
      const value = refined[key];
      if (value !== undefined && value !== null && value !== "") {
        // @ts-expect-error — key-by-key copy across a heterogeneous shape
        merged[key] = value;
      }
    }

    // Snapshot the pre-refine state so the change can be reverted.
    await supabase.from("proposal_versions").insert({
      proposal_id: id,
      proposal_data: before,
      change_summary: instruction.trim().slice(0, 200),
      created_by: "ai",
    });

    const { error } = await supabase
      .from("proposals")
      .update({ proposal_data: merged })
      .eq("id", id);

    if (error) throw error;

    // Non-blocking audit trail, consistent with the other AI routes.
    supabase
      .from("generations")
      .insert({
        user_id: user.id,
        deal_id: proposal.deal_id,
        module: "proposal_refine",
        input: instruction.trim(),
        output: JSON.stringify(merged),
      })
      .then(() => {});

    return NextResponse.json({
      proposal_data: merged,
      changed: PROPOSAL_KEYS.filter(
        (k) => JSON.stringify(before[k]) !== JSON.stringify(merged[k])
      ),
    });
  } catch (err) {
    console.error("[proposals/refine] failed:", err);
    return NextResponse.json({ error: "refine_failed" }, { status: 502 });
  }
}
