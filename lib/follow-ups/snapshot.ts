import type { SupabaseClient } from "@supabase/supabase-js";
import type { DealSnapshot } from "./rules";

/**
 * The join every "what should happen next" question needs.
 *
 * A deal on its own says almost nothing useful. What makes it actionable is
 * the proposal attached to it, whether the client has opened that proposal and
 * how often, and when anything last happened. This assembles that in four
 * queries rather than one per deal.
 *
 * Shared by the follow-up sweep and the pipeline, so the board and the queue
 * can never disagree about what a deal needs — they are reading the same
 * snapshot through the same rules.
 */

export interface EnrichedSnapshot extends DealSnapshot {
  /** Carried through for rendering; the rules themselves do not read these. */
  pain_point: string | null;
  budget_signal: string | null;
  timeline: string | null;
  client_email: string | null;
  fit_score: number | null;
  stage_entered_at: string | null;
}

const DEAL_LIMIT = 300;

export async function buildSnapshots(
  supabase: SupabaseClient,
  userId: string,
  opts: { includeClosed?: boolean } = {}
): Promise<EnrichedSnapshot[]> {
  let dealQuery = supabase
    .from("deals")
    .select(
      "id, client_name, client_company, client_email, stage, proposed_amount, pain_point, budget_signal, timeline, fit_score, created_at, updated_at"
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(DEAL_LIMIT);

  if (!opts.includeClosed) dealQuery = dealQuery.neq("stage", "lost");

  const { data: deals } = await dealQuery;
  if (!deals || deals.length === 0) return [];

  const dealIds = deals.map((d) => d.id as string);

  const [{ data: proposals }, { data: events }] = await Promise.all([
    supabase
      .from("proposals")
      .select("id, deal_id, shared_at, created_at, status")
      .in("deal_id", dealIds)
      .eq("kind", "client")
      .order("created_at", { ascending: false }),
    supabase
      .from("deal_events")
      .select("deal_id, kind, created_at")
      .in("deal_id", dealIds)
      .order("created_at", { ascending: false }),
  ]);

  // Latest proposal per deal.
  const proposalByDeal = new Map<string, { id: string; shared_at: string | null }>();
  for (const p of proposals ?? []) {
    const dealId = p.deal_id as string;
    if (!proposalByDeal.has(dealId)) {
      proposalByDeal.set(dealId, {
        id: p.id as string,
        shared_at: (p.shared_at as string | null) ?? null,
      });
    }
  }

  const proposalIds = [...proposalByDeal.values()].map((p) => p.id);
  const { data: views } = proposalIds.length
    ? await supabase
        .from("proposal_views")
        .select("proposal_id, opened_at")
        .in("proposal_id", proposalIds)
        .order("opened_at", { ascending: false })
    : { data: [] };

  const viewStats = new Map<string, { last: string; count: number }>();
  for (const v of views ?? []) {
    const id = v.proposal_id as string;
    const current = viewStats.get(id);
    if (current) current.count += 1;
    else viewStats.set(id, { last: v.opened_at as string, count: 1 });
  }

  const lastEventByDeal = new Map<string, string>();
  const stageEnteredByDeal = new Map<string, string>();
  for (const e of events ?? []) {
    const id = e.deal_id as string;
    if (!lastEventByDeal.has(id)) lastEventByDeal.set(id, e.created_at as string);
    // Events arrive newest first, so the first stage_changed we see is the
    // most recent one — which is when the deal entered the stage it is in.
    if (e.kind === "stage_changed" && !stageEnteredByDeal.has(id)) {
      stageEnteredByDeal.set(id, e.created_at as string);
    }
  }

  return deals.map((d) => {
    const id = d.id as string;
    const proposal = proposalByDeal.get(id) ?? null;
    const stats = proposal ? viewStats.get(proposal.id) : undefined;

    return {
      id,
      client_name: (d.client_name as string | null) ?? null,
      client_company: (d.client_company as string | null) ?? null,
      client_email: (d.client_email as string | null) ?? null,
      pain_point: (d.pain_point as string | null) ?? null,
      budget_signal: (d.budget_signal as string | null) ?? null,
      timeline: (d.timeline as string | null) ?? null,
      fit_score: (d.fit_score as number | null) ?? null,
      stage: d.stage as DealSnapshot["stage"],
      proposed_amount: (d.proposed_amount as number | null) ?? null,
      created_at: d.created_at as string,
      updated_at: d.updated_at as string,
      last_activity_at: lastEventByDeal.get(id) ?? null,
      // Falls back to creation: a deal that never moved has been in its
      // opening stage since it existed.
      stage_entered_at: stageEnteredByDeal.get(id) ?? (d.created_at as string),
      proposal: proposal
        ? {
            id: proposal.id,
            shared_at: proposal.shared_at,
            last_viewed_at: stats?.last ?? null,
            view_count: stats?.count ?? 0,
          }
        : null,
    };
  });
}
