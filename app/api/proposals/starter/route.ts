import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { latestSpecification, latestFacts } from "@/lib/onboarding/persist";
import { generateStarterProposal } from "@/lib/onboarding/starter-proposal";
import { checkAiBudget, rateLimitResponse } from "@/lib/rate-limit";


const RATE_LIMIT = { action: "starter_proposal", limit: 10, windowMinutes: 60 };

/**
 * Write the starter proposal now, rather than waiting for the queue.
 *
 * The queue is the right home for this — nobody should sit through a model
 * call during setup — but a queue only drains if something is calling the
 * worker. In local development nothing is, and in production a scheduler can
 * be down or a job can fail terminally. Either way the person is left staring
 * at "being written" forever with no way out.
 *
 * So this is the escape hatch, and it runs the identical code the worker runs.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limit = await checkAiBudget(user.id, RATE_LIMIT);
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

  const { data: proposal } = await supabase
    .from("proposals")
    .select("id, generation_state, generation_meta")
    .eq("user_id", user.id)
    .eq("kind", "starter")
    .maybeSingle();

  if (!proposal) {
    return NextResponse.json({ error: "no_starter_proposal" }, { status: 404 });
  }

  const [spec, facts] = await Promise.all([
    latestSpecification(supabase, user.id),
    latestFacts(supabase, user.id),
  ]);

  if (!spec || !facts) {
    return NextResponse.json({ error: "no_specification" }, { status: 409 });
  }

  await supabase
    .from("proposals")
    .update({ generation_state: "processing_document" })
    .eq("id", proposal.id);

  try {
    const result = await generateStarterProposal(facts, spec.spec);
    const state = result.quality.ready_for_human_review
      ? "ready_for_review"
      : "needs_input";

    await supabase
      .from("proposals")
      .update({
        proposal_data: result.proposal,
        generation_state: state,
        generation_meta: {
          ...((proposal.generation_meta as Record<string, unknown>) ?? {}),
          model_request_id: result.requestId,
          quality: result.quality,
          generated_at: new Date().toISOString(),
          generated_via: "on_demand",
        },
      })
      .eq("id", proposal.id);

    return NextResponse.json({ ok: true, id: proposal.id, state });
  } catch (err) {
    console.error("[proposals/starter] generation failed:", err);

    await supabase
      .from("proposals")
      .update({
        generation_state: "failed_retryable",
        generation_meta: {
          ...((proposal.generation_meta as Record<string, unknown>) ?? {}),
          failure: err instanceof Error ? err.message : String(err),
          failed_at: new Date().toISOString(),
        },
      })
      .eq("id", proposal.id);

    return NextResponse.json({ error: "generation_failed" }, { status: 502 });
  }
}
