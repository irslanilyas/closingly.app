import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildSnapshots } from "@/lib/follow-ups/snapshot";
import { raiseForDeal } from "@/lib/follow-ups/rules";
import type { DealStage } from "@/lib/types";

export const runtime = "nodejs";

/**
 * The pipeline, with the reason each deal is where it is.
 *
 * The old board answered "what stage is this in", which the person already
 * knew. This answers "what does this deal need", using the same rules that
 * raise follow-ups — so the board and the queue can never contradict each
 * other about what to do next.
 */

export type EngagementLevel =
  | "no_proposal"
  | "unsent"
  | "unopened"
  | "opened"
  | "engaged";

export interface PipelineDeal {
  id: string;
  client_name: string | null;
  client_company: string | null;
  client_email: string | null;
  pain_point: string | null;
  stage: DealStage;
  proposed_amount: number | null;
  fit_score: number | null;
  created_at: string;
  updated_at: string;

  days_in_stage: number;
  /** Null when nothing has ever been recorded against the deal. */
  days_since_activity: number | null;

  engagement: EngagementLevel;
  proposal_id: string | null;
  view_count: number;
  last_viewed_at: string | null;

  /** What the follow-up rules say, if anything. */
  next_action: { reason: string; priority: 1 | 2 | 3; kind: string } | null;
  /** Whether that action is already sitting in the queue. */
  queued: boolean;
}

const DAY_MS = 86_400_000;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [snapshots, { data: openFollowUps }] = await Promise.all([
    buildSnapshots(supabase, user.id, { includeClosed: true }),
    supabase
      .from("follow_ups")
      .select("deal_id")
      .eq("user_id", user.id)
      .in("status", ["open", "snoozed"]),
  ]);

  const queued = new Set(
    (openFollowUps ?? []).map((f) => f.deal_id as string).filter(Boolean)
  );

  const now = new Date();

  const deals: PipelineDeal[] = snapshots.map((s) => {
    const proposal = s.proposal;

    const engagement: EngagementLevel = !proposal
      ? "no_proposal"
      : !proposal.shared_at
        ? "unsent"
        : proposal.view_count === 0
          ? "unopened"
          : proposal.view_count > 2
            ? "engaged"
            : "opened";

    // Closed deals get no next action. Telling someone to chase a deal they
    // already won is how a product loses trust in one glance.
    const raised =
      s.stage === "won" || s.stage === "lost" ? [] : raiseForDeal(s, now);
    const top = raised.sort((a, b) => a.priority - b.priority)[0] ?? null;

    return {
      id: s.id,
      client_name: s.client_name,
      client_company: s.client_company,
      client_email: s.client_email,
      pain_point: s.pain_point,
      stage: s.stage,
      proposed_amount: s.proposed_amount,
      fit_score: s.fit_score,
      created_at: s.created_at,
      updated_at: s.updated_at,
      days_in_stage: daysSince(s.stage_entered_at) ?? 0,
      days_since_activity: daysSince(s.last_activity_at),
      engagement,
      proposal_id: proposal?.id ?? null,
      view_count: proposal?.view_count ?? 0,
      last_viewed_at: proposal?.last_viewed_at ?? null,
      next_action: top
        ? { reason: top.reason, priority: top.priority, kind: top.kind }
        : null,
      queued: queued.has(s.id),
    };
  });

  return NextResponse.json({ deals });
}
