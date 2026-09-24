import { createAdminClient } from "@/lib/supabase/admin";
import {
  CLAUDE_FAST_MODEL,
  CLAUDE_MODEL,
  complete,
  parseJsonResponse,
} from "@/lib/anthropic";
import { proposalPrompt, triagePrompt } from "@/lib/prompts";
import type {
  DealEventKind,
  MeetingKind,
  ProposalGeneration,
} from "@/lib/types";

/** Triage only needs the shape of the conversation, not all of it. */
const TRIAGE_CHARS = 4000;

/** Below this there isn't enough said to classify, let alone extract. */
const MIN_TRANSCRIPT_CHARS = 200;

interface TriageResult {
  kind: MeetingKind;
  confidence: "high" | "medium" | "low";
  reason: string;
}

export interface ProcessResult {
  kind: MeetingKind;
  dealId: string | null;
  proposalId: string | null;
  skippedReason?: string;
}

/**
 * Turn a finished meeting's transcript into a deal and a draft proposal.
 *
 * Only discovery calls create anything. A check-in almost always belongs to a
 * deal that already exists, and auto-creating a second one would quietly fill
 * the pipeline with duplicates — so the transcript stays on the meeting and the
 * user attaches it themselves. Junk in the pipeline is worse than a manual step.
 *
 * Nothing is ever sent. The proposal is a draft the user reviews.
 *
 * @param source Stamped onto the created deal. The bot flow leaves the default;
 * a hand-imported transcript passes `"imported"`. Worth distinguishing because
 * the two have different trustworthiness — an imported transcript came from
 * some other tool with its own speaker-labelling quirks, and later analysis
 * (win rates, pricing calibration) shouldn't silently blend the two.
 */
export async function dealFromTranscript(
  meetingId: string,
  source: string = "meeting_agent"
): Promise<ProcessResult> {
  const supabase = createAdminClient();

  const { data: meeting, error } = await supabase
    .from("meetings")
    .select("id, user_id, title, transcript, starts_at, deal_id")
    .eq("id", meetingId)
    .single();

  if (error || !meeting) throw new Error(`Meeting ${meetingId} not found`);
  if (!meeting.transcript) throw new Error(`Meeting ${meetingId} has no transcript`);

  // Idempotency — a duplicate webhook that slipped past dedupe must not
  // create a second deal for the same meeting.
  if (meeting.deal_id) {
    return {
      kind: "other",
      dealId: meeting.deal_id,
      proposalId: null,
      skippedReason: "already_processed",
    };
  }

  const transcript = meeting.transcript.trim();

  if (transcript.length < MIN_TRANSCRIPT_CHARS) {
    await supabase
      .from("meetings")
      .update({ meeting_kind: "other" })
      .eq("id", meetingId);
    return {
      kind: "other",
      dealId: null,
      proposalId: null,
      skippedReason: "transcript_too_short",
    };
  }

  // ── 1. Triage ──────────────────────────────────────────────────────────
  const triage = parseJsonResponse<TriageResult>(
    await complete({
      model: CLAUDE_FAST_MODEL,
      prompt: triagePrompt(transcript.slice(0, TRIAGE_CHARS)),
      maxTokens: 256,
    })
  );

  await supabase
    .from("meetings")
    .update({ meeting_kind: triage.kind })
    .eq("id", meetingId);

  if (triage.kind !== "discovery") {
    return {
      kind: triage.kind,
      dealId: null,
      proposalId: null,
      skippedReason: `classified_as_${triage.kind}`,
    };
  }

  // ── 2. Extract ─────────────────────────────────────────────────────────
  const extracted = parseJsonResponse<ProposalGeneration>(
    await complete({
      model: CLAUDE_MODEL,
      prompt: proposalPrompt(transcript),
      maxTokens: 4096,
    })
  );

  // ── 3. Create the deal ─────────────────────────────────────────────────
  const { data: deal, error: dealError } = await supabase
    .from("deals")
    .insert({
      user_id: meeting.user_id,
      client_name: extracted.client_name ?? null,
      client_company: extracted.client_company ?? null,
      pain_point: extracted.pain_point ?? null,
      budget_signal: extracted.budget_signal ?? null,
      timeline: extracted.timeline ?? null,
      decision_maker: extracted.decision_maker ?? null,
      fit_score: clampScore(extracted.fit_score),
      transcript,
      competitor_mentioned: extracted.competitor_mentioned ?? null,
      competitive_note: extracted.competitive_note ?? null,
      proposed_amount: parseAmount(extracted.proposal?.investment_number),
      stage: "lead",
      source,
    })
    .select("id")
    .single();

  if (dealError || !deal) {
    throw new Error(`Failed to create deal: ${dealError?.message}`);
  }

  // ── 4. Draft the proposal ──────────────────────────────────────────────
  let proposalId: string | null = null;

  if (extracted.proposal) {
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .insert({
        deal_id: deal.id,
        user_id: meeting.user_id,
        meeting_id: meeting.id,
        proposal_data: extracted.proposal,
        status: "draft",
      })
      .select("id")
      .single();

    if (proposalError) {
      // The deal is still valuable without the draft — don't fail the whole
      // job and re-run the expensive extraction on retry.
      console.error("[from-transcript] proposal insert failed:", proposalError);
    } else {
      proposalId = proposal.id;
    }
  }

  // ── 5. Link and log ────────────────────────────────────────────────────
  await supabase
    .from("meetings")
    .update({ deal_id: deal.id })
    .eq("id", meetingId);

  const events: Array<{
    deal_id: string;
    user_id: string;
    kind: DealEventKind;
    to_value: string;
    metadata: Record<string, unknown>;
  }> = [
    {
      deal_id: deal.id,
      user_id: meeting.user_id,
      kind: "meeting_recorded",
      to_value: meeting.title ?? "Meeting",
      metadata: { meeting_id: meeting.id, confidence: triage.confidence },
    },
  ];

  if (proposalId) {
    events.push({
      deal_id: deal.id,
      user_id: meeting.user_id,
      kind: "proposal_drafted",
      to_value: extracted.proposal?.investment_number ?? "Draft",
      metadata: { proposal_id: proposalId },
    });
  }

  if (extracted.competitor_mentioned) {
    events.push({
      deal_id: deal.id,
      user_id: meeting.user_id,
      kind: "competitor_flagged",
      to_value: extracted.competitor_mentioned,
      metadata: { note: extracted.competitive_note ?? null },
    });
  }

  await supabase.from("deal_events").insert(events);

  return { kind: "discovery", dealId: deal.id, proposalId };
}

export function clampScore(score: unknown): number | null {
  const n = typeof score === "number" ? Math.round(score) : NaN;
  if (!Number.isFinite(n)) return null;
  // The column has a 1–10 check constraint; a model that returns 0 or 11
  // would otherwise fail the whole insert.
  return Math.min(10, Math.max(1, n));
}

/** "PKR 450,000" / "$12k" / "12,000" → a number, or null if it isn't one. */
export function parseAmount(value: unknown): number | null {
  if (typeof value !== "string") return null;

  const match = value.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*([kKmM])?/);
  if (!match) return null;

  let amount = parseFloat(match[1]);
  if (!Number.isFinite(amount)) return null;

  const suffix = match[2]?.toLowerCase();
  if (suffix === "k") amount *= 1_000;
  if (suffix === "m") amount *= 1_000_000;

  return Math.round(amount);
}
