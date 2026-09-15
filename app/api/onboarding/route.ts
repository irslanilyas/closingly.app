import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateAnswers } from "@/lib/onboarding/schema";
import { persistOnboarding } from "@/lib/onboarding/persist";
import { enqueue } from "@/lib/jobs";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";


/**
 * Resubmitting is legitimate — settings changes write a new profile version —
 * but a loop hammering this would queue a generation job per request.
 */
const RATE_LIMIT = { action: "onboarding_submit", limit: 10, windowMinutes: 60 };

/**
 * Completes onboarding.
 *
 * Writes the three versioned records, enqueues the starter-proposal job, and
 * returns immediately: the person moves to the calendar step while generation
 * runs. Nothing here waits on a model.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limit = await checkRateLimit(user.id, RATE_LIMIT);
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const result = validateAnswers(body);
  if (!result.ok || !result.answers) {
    return NextResponse.json(
      { error: "invalid_answers", fields: result.errors },
      { status: 400 }
    );
  }

  let persisted;
  try {
    persisted = await persistOnboarding(supabase, user.id, result.answers);
  } catch (err) {
    console.error("[onboarding] persist failed:", err);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  // The proposal row is created here, already in `queued`, rather than by the
  // worker. That way the workspace has something real to point at the instant
  // onboarding finishes, even if the queue is backed up — the person sees
  // "being generated", not an empty proposals list.
  //
  // Read-then-write rather than upsert: the one-starter-per-user index is
  // partial (`where kind = 'starter'`), which PostgREST cannot use for
  // conflict inference.
  const meta = {
    specification_id: persisted.specificationId,
    specification_version: persisted.version,
    workspace_profile_id: persisted.workspaceProfileId,
    brand_profile_id: persisted.brandProfileId,
    queued_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from("proposals")
    .select("id")
    .eq("user_id", user.id)
    .eq("kind", "starter")
    .maybeSingle();

  const write = existing
    ? supabase
        .from("proposals")
        .update({ generation_state: "queued", generation_meta: meta })
        .eq("id", existing.id)
        .select("id")
        .single()
    : supabase
        .from("proposals")
        .insert({
          user_id: user.id,
          deal_id: null,
          kind: "starter",
          status: "draft",
          generation_state: "queued",
          proposal_data: {},
          generation_meta: meta,
        })
        .select("id")
        .single();

  const { data: proposal, error: proposalError } = await write;

  if (proposalError || !proposal) {
    console.error("[onboarding] starter proposal row failed:", proposalError);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  try {
    await enqueue(
      "starter_proposal",
      { user_id: user.id, proposal_id: proposal.id },
      { dedupeKey: `starter:${persisted.specificationId}` }
    );
  } catch (err) {
    // The profile is saved and the row exists in `queued`. Blocking the person
    // in onboarding over a queue write would be the worse failure.
    console.error("[onboarding] enqueue failed:", err);
  }

  // Last, so a partial write leaves them inside onboarding rather than in an
  // app with no configuration behind it.
  //
  // Upsert rather than update: a signup trigger creates this row, and an
  // update that silently matches nothing would loop someone through
  // onboarding forever with no error anywhere to explain why.
  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      email: user.email ?? "",
      onboarding_completed_at: new Date().toISOString(),
      onboarding_step: 4,
    },
    { onConflict: "id" }
  );

  if (profileError) {
    console.error("[onboarding] profile update failed:", profileError);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, proposal_id: proposal.id });
}
