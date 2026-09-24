import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildSnapshots } from "@/lib/follow-ups/snapshot";
import {
  daysSince,
  engagementOf,
  nextActionOf,
  type EngagementLevel,
  type NextAction,
} from "@/lib/deal-signals";
import type { DealStage } from "@/lib/types";


/**
 * The pipeline, with the reason each deal is where it is.
 *
 * The old board answered "what stage is this in", which the person already
 * knew. This answers "what does this deal need", using the same rules that
 * raise follow-ups — so the board and the queue can never contradict each
 * other about what to do next.
 */

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
  next_action: NextAction | null;
  /** Whether that action is already sitting in the queue. */
  queued: boolean;
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
      engagement: engagementOf(s),
      proposal_id: proposal?.id ?? null,
      view_count: proposal?.view_count ?? 0,
      last_viewed_at: proposal?.last_viewed_at ?? null,
      next_action: nextActionOf(s, now),
      queued: queued.has(s.id),
    };
  });

  return NextResponse.json({ deals });
}
