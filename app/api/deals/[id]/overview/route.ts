import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildSnapshots } from "@/lib/follow-ups/snapshot";
import { computeClientHealth } from "@/lib/client-health";
import { toProposalData } from "@/lib/proposal-data";
import {
  daysSince,
  engagementOf,
  nextActionOf,
  stageIsStale,
  type EngagementLevel,
  type NextAction,
} from "@/lib/deal-signals";
import { field } from "@/lib/validate";
import {
  STAGE_PROBABILITY,
  type ClientHealth,
  type Deal,
  type DealEvent,
  type ProposalData,
  type TranscriptSegment,
} from "@/lib/types";

/**
 * Everything the deal page shows, in one round trip.
 *
 * The page is where a consultant decides what to do about one client, so it
 * needs the deal, what the rules say should happen next, the follow-up that is
 * already drafted, the proposal and how the client has read it, the last call,
 * and the history, all at once. Loading those as nine separate requests from
 * the browser is what made the old page assemble itself in stages.
 *
 * Every query runs through the caller's session, so row-level security scopes
 * all of it: someone else's deal id reads as 404.
 */

export interface Quote {
  text: string;
  speaker: string;
  /** Seconds into the recording. */
  start: number;
}

export interface DealOverview {
  deal: Deal;
  signals: {
    days_in_stage: number;
    days_since_activity: number | null;
    engagement: EngagementLevel;
    stage_probability: number;
    stale: boolean;
    next_action: NextAction | null;
  };
  follow_up: {
    id: string;
    kind: string;
    reason: string;
    priority: 1 | 2 | 3;
    status: "open" | "snoozed";
    due_at: string;
    draft_subject: string | null;
    draft_body: string | null;
    drafted_at: string | null;
  } | null;
  proposal: {
    id: string;
    status: string;
    share_token: string | null;
    shared_at: string | null;
    created_at: string;
    versions: number;
    data: ProposalData;
    tracking: {
      total_views: number;
      unique_viewers: number;
      last_viewed_at: string | null;
      total_seconds: number;
      /** Section keys the client scrolled into view at least once. */
      sections_viewed: string[];
    };
  } | null;
  meeting: {
    id: string;
    title: string | null;
    starts_at: string | null;
    recording_seconds: number | null;
    quote: Quote | null;
  } | null;
  events: DealEvent[];
  health: ClientHealth | null;
}

const EVENT_LIMIT = 12;

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/**
 * One line worth reading from the last call.
 *
 * The later half of a call is where scope, price and objections surface, so
 * that is where it looks first, for the fullest thing anyone said. Short
 * fragments ("yeah, makes sense") are never chosen.
 */
function pickQuote(segments: TranscriptSegment[] | null): Quote | null {
  if (!segments?.length) return null;
  const substantial = segments.filter((s) => words(s.text) >= 12);
  if (!substantial.length) return null;

  const midpoint = (segments[segments.length - 1].end ?? 0) / 2;
  const late = substantial.filter((s) => s.start >= midpoint);
  const pool = late.length ? late : substantial;
  const best = pool.reduce((a, b) => (words(b.text) > words(a.text) ? b : a));

  const text =
    best.text.length > 220 ? `${best.text.slice(0, 217).trimEnd()}...` : best.text;
  return { text, speaker: best.speaker, start: best.start };
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!field.id.safeParse(id).success) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [dealResult, snapshots, followUpResult, proposalResult, meetingResult, eventsResult] =
    await Promise.all([
      supabase.from("deals").select("*").eq("id", id).maybeSingle(),
      buildSnapshots(supabase, user.id, { includeClosed: true, dealId: id }),
      supabase
        .from("follow_ups")
        .select(
          "id, kind, reason, priority, status, due_at, draft_subject, draft_body, drafted_at"
        )
        .eq("deal_id", id)
        .in("status", ["open", "snoozed"])
        .order("priority", { ascending: true })
        .order("due_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("proposals")
        .select("id, status, share_token, shared_at, created_at, proposal_data")
        .eq("deal_id", id)
        .eq("kind", "client")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("meetings")
        .select("id, title, starts_at, recording_seconds, transcript_segments")
        .eq("deal_id", id)
        .not("transcript", "is", null)
        .order("starts_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("deal_events")
        .select("*")
        .eq("deal_id", id)
        .order("created_at", { ascending: false })
        .limit(EVENT_LIMIT),
    ]);

  if (dealResult.error) {
    console.error("[deals/overview] deal read failed:", dealResult.error.message);
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }
  const deal = dealResult.data as Deal | null;
  const snapshot = snapshots[0];
  if (!deal || !snapshot) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // The proposal's own reading history, for the tracking card.
  const proposalRow = proposalResult.data;
  let proposal: DealOverview["proposal"] = null;
  if (proposalRow) {
    const [{ data: views }, { count: versions }] = await Promise.all([
      supabase
        .from("proposal_views")
        .select("ip_hash, opened_at, duration_seconds, sections_viewed")
        .eq("proposal_id", proposalRow.id)
        .order("opened_at", { ascending: false }),
      supabase
        .from("proposal_versions")
        .select("id", { count: "exact", head: true })
        .eq("proposal_id", proposalRow.id),
    ]);

    const rows = views ?? [];
    const sections = new Set<string>();
    for (const view of rows) {
      for (const key of (view.sections_viewed as string[] | null) ?? []) sections.add(key);
    }

    proposal = {
      id: proposalRow.id as string,
      status: proposalRow.status as string,
      share_token: (proposalRow.share_token as string | null) ?? null,
      shared_at: (proposalRow.shared_at as string | null) ?? null,
      created_at: proposalRow.created_at as string,
      // Saved edits snapshot the previous version, so the current draft is
      // one more than the history holds.
      versions: (versions ?? 0) + 1,
      data: toProposalData(proposalRow.proposal_data),
      tracking: {
        total_views: rows.length,
        unique_viewers: new Set(rows.map((v) => v.ip_hash).filter(Boolean)).size,
        last_viewed_at: (rows[0]?.opened_at as string | undefined) ?? null,
        total_seconds: rows.reduce((sum, v) => sum + ((v.duration_seconds as number | null) ?? 0), 0),
        sections_viewed: [...sections],
      },
    };
  }

  const meetingRow = meetingResult.data;
  const daysInStage = daysSince(snapshot.stage_entered_at) ?? 0;
  const closed = deal.stage === "won" || deal.stage === "lost";

  const overview: DealOverview = {
    deal,
    signals: {
      days_in_stage: daysInStage,
      days_since_activity: daysSince(snapshot.last_activity_at),
      engagement: engagementOf(snapshot),
      stage_probability: STAGE_PROBABILITY[deal.stage],
      stale: !closed && stageIsStale(daysInStage),
      next_action: nextActionOf(snapshot),
    },
    follow_up: (followUpResult.data as DealOverview["follow_up"]) ?? null,
    proposal,
    meeting: meetingRow
      ? {
          id: meetingRow.id as string,
          title: (meetingRow.title as string | null) ?? null,
          starts_at: (meetingRow.starts_at as string | null) ?? null,
          recording_seconds: (meetingRow.recording_seconds as number | null) ?? null,
          quote: pickQuote(meetingRow.transcript_segments as TranscriptSegment[] | null),
        }
      : null,
    events: (eventsResult.data as DealEvent[] | null) ?? [],
    // Health describes a deal still in play; a closed one has an outcome instead.
    health: closed
      ? null
      : computeClientHealth({
          lastEventAt: snapshot.last_activity_at,
          hasSharedProposal: !!snapshot.proposal?.shared_at,
          hasViewedProposal: (snapshot.proposal?.view_count ?? 0) > 0,
        }),
  };

  return NextResponse.json(overview);
}
