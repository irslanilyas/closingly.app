import type { ProposalTheme } from "@/lib/proposal-theme";

export type DealStage =
  | "lead"
  | "proposal_sent"
  | "negotiating"
  | "won"
  | "lost";

export const STAGE_LABELS: Record<DealStage, string> = {
  lead: "Lead",
  proposal_sent: "Proposal Sent",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
};

export const STAGE_ORDER: DealStage[] = [
  "lead",
  "proposal_sent",
  "negotiating",
  "won",
  "lost",
];

export const STAGE_PROBABILITY: Record<DealStage, number> = {
  lead: 0.1,
  proposal_sent: 0.3,
  negotiating: 0.6,
  won: 1,
  lost: 0,
};

export interface ProposalData {
  challenge: string;
  approach: string;
  deliverables: string[];
  timeline_phased: string;
  investment_number: string;
  investment_terms: string;
  next_steps: string;
}

export interface SuggestedReply {
  tone: string;
  subject: string;
  body: string;
}

export interface Deal {
  id: string;
  user_id: string;
  client_name: string | null;
  client_company: string | null;
  client_email: string | null;
  transcript: string | null;
  pain_point: string | null;
  budget_signal: string | null;
  timeline: string | null;
  decision_maker: string | null;
  fit_score: number | null;
  suggested_replies: SuggestedReply[] | null;
  stage: DealStage;
  source: string;
  notes: string | null;
  proposed_amount: number | null;
  estimated_hours: number | null;
  start_date: string | null;
  target_end_date: string | null;
  competitor_mentioned: string | null;
  competitive_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProposalGeneration {
  client_name: string;
  client_company: string;
  pain_point: string;
  budget_signal: string;
  timeline: string;
  decision_maker: string;
  fit_score: number;
  competitor_mentioned: string | null;
  competitive_note: string | null;
  proposal: ProposalData;
  suggested_replies: SuggestedReply[];
}

export interface PostmortemResult {
  what_went_wrong: string;
  earliest_warning_sign: string;
  price_or_scope_factor: string;
  what_to_try_next_time: string;
}

export interface CaseStudyResult {
  headline: string;
  summary: string;
  client_quote: string;
  results: string[];
  testimonial_request_email: {
    subject: string;
    body: string;
  };
}

export interface ScopeAnalysis {
  verdict: "in_scope" | "scope_creep" | "grey_area";
  reasoning: string;
  suggested_response: string;
  estimated_additional_billing: string;
}

export interface PricingResult {
  price_low: number;
  price_mid: number;
  price_high: number;
  currency: string;
  reasoning: string[];
  confidence: "high" | "medium" | "low";
  confidence_reason: string;
}

/* ── Meetings ─────────────────────────────────────────────────────────── */

export type MeetingStatus =
  | "scheduled"
  | "bot_scheduled"
  | "recording"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  scheduled: "Scheduled",
  bot_scheduled: "Agent ready",
  recording: "Recording",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

/** Set by the triage pass. Only `discovery` auto-drafts a proposal. */
export type MeetingKind =
  | "discovery"
  | "check_in"
  | "kickoff"
  | "internal"
  | "other";

export type MeetingPlatform = "google_meet" | "zoom" | "teams" | "other";

export interface Attendee {
  email: string;
  displayName?: string;
  organizer?: boolean;
  /** Google marks the calendar owner's own row. Used to read their RSVP. */
  self?: boolean;
  responseStatus?: string;
}

/** A speaker's turn with playback offsets, mirrored from lib/recall.ts. */
export interface TranscriptSegment {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

export interface Meeting {
  id: string;
  user_id: string;
  deal_id: string | null;
  google_event_id: string | null;
  recall_bot_id: string | null;
  title: string | null;
  starts_at: string | null;
  ends_at: string | null;
  attendees: Attendee[];
  meet_link: string | null;
  platform: MeetingPlatform | null;
  agent_enabled: boolean;
  status: MeetingStatus;
  transcript: string | null;
  transcript_segments: TranscriptSegment[] | null;
  transcript_fetched_at: string | null;
  recording_seconds: number | null;
  meeting_kind: MeetingKind | null;
  /** False for flights, birthdays, focus blocks and solo holds. */
  is_call: boolean;
  event_type: string | null;
  not_call_reason: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/* ── Proposals ────────────────────────────────────────────────────────── */

export type ProposalStatus = "draft" | "shared" | "accepted" | "rejected";

export interface Proposal {
  id: string;
  deal_id: string;
  user_id: string;
  meeting_id: string | null;
  template_id: string | null;
  proposal_data: ProposalData;
  status: ProposalStatus;
  share_token: string | null;
  share_expires_at: string | null;
  shared_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProposalVersion {
  id: string;
  proposal_id: string;
  proposal_data: ProposalData;
  change_summary: string | null;
  created_by: "ai" | "user";
  created_at: string;
}

export interface ProposalView {
  id: string;
  proposal_id: string;
  ip_hash: string | null;
  user_agent: string | null;
  referrer: string | null;
  opened_at: string;
  duration_seconds: number | null;
  /** Section keys the viewer actually scrolled through — the useful signal. */
  sections_viewed: string[];
}

export interface Template {
  id: string;
  user_id: string | null;
  name: string;
  description: string | null;
  /** Validated design spec — see lib/proposal-theme.ts. Never code. */
  design: ProposalTheme;
  is_builtin: boolean;
  created_at: string;
}

/* ── Deal activity ────────────────────────────────────────────────────── */

export type DealEventKind =
  | "created"
  | "stage_changed"
  | "meeting_recorded"
  | "proposal_drafted"
  | "proposal_shared"
  | "proposal_viewed"
  | "followup_generated"
  | "note_added"
  | "postmortem_generated"
  | "case_study_generated"
  | "competitor_flagged";

export interface DealEvent {
  id: string;
  deal_id: string;
  user_id: string;
  kind: DealEventKind;
  from_value: string | null;
  to_value: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/* ── Background jobs ──────────────────────────────────────────────────── */

/** Slow AI work, kept out of the Recall webhook so it can return fast. */
export type JobKind = "process_transcript" | "starter_proposal";

export type JobStatus = "pending" | "running" | "done" | "failed";

export interface Job {
  id: string;
  kind: JobKind;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  run_after: string;
  locked_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/* ── Recording allowance ──────────────────────────────────────────────── */

/** Recall bills per hour, so the cap is enforced in-app, not on the invoice. */
export interface RecordingUsage {
  used_seconds: number;
  limit_seconds: number;
  remaining_seconds: number;
  percent_used: number;
}

/* ── Insights (Phase 13) ──────────────────────────────────────────────── */

export interface WinLossStats {
  count: number;
  avg_proposed_amount: number | null;
  avg_followups: number;
  avg_days_to_close: number | null;
}

export interface TemplateWinRate {
  template_id: string;
  template_name: string;
  won: number;
  lost: number;
  win_rate: number;
}

/** Below this many closed deals, the stats are noise, not signal. */
export const WIN_LOSS_MIN_SAMPLE = 5;

export type WinLossInsights =
  | { insufficient_data: true; closed_count: number; needed: number }
  | {
      insufficient_data: false;
      won: WinLossStats;
      lost: WinLossStats;
      by_template: TemplateWinRate[];
    };

export interface CapacityWeek {
  week_start: string;
  hours_committed: number;
  capacity_hours: number;
  over_capacity: boolean;
}

export interface CapacityInsights {
  weekly_capacity_hours: number;
  weeks: CapacityWeek[];
  /** Deals contributing hours but missing dates/estimate — surfaced so the user knows to fill them in. */
  unscheduled_deal_count: number;
}

/* ── Client health (Phase 13) ─────────────────────────────────────────── */

export type ClientHealthLevel = "healthy" | "cooling" | "at_risk";

export interface ClientHealth {
  level: ClientHealthLevel;
  score: number;
  reasons: string[];
}

export function toRecordingUsage(
  used: number,
  limit: number
): RecordingUsage {
  const remaining = Math.max(0, limit - used);
  return {
    used_seconds: used,
    limit_seconds: limit,
    remaining_seconds: remaining,
    percent_used: limit > 0 ? Math.min(100, (used / limit) * 100) : 0,
  };
}

/* ── Generated documents (onboarding output contract) ──────────────────────
   The section-based shape the generation service must return. Distinct from
   the older fixed-field `ProposalData`: a section carries its own confidence
   and evidence, which is what makes "this sentence is a placeholder, that one
   came from the transcript" expressible at all.                            */

export type SectionConfidence = "confirmed" | "inferred" | "placeholder";

export interface GeneratedSection {
  key: string;
  heading: string;
  body: string;
  /** Transcript segment ids. Always empty for a starter proposal. */
  evidence: string[];
  confidence: SectionConfidence;
}

export interface GeneratedProposal {
  title: string;
  subtitle: string;
  sections: GeneratedSection[];
  commercial_summary: {
    pricing_text: string;
    timeline_text: string;
    assumptions: string[];
    requires_approval: boolean;
  };
  recommended_next_step: string;
  open_questions: string[];
  scope_risks: string[];
}

export interface GenerationQuality {
  missing_required_fields: string[];
  unsupported_claims: string[];
  brand_alignment_notes: string[];
  ready_for_human_review: boolean;
}

export interface GenerationResult {
  proposal: GeneratedProposal;
  quality: GenerationQuality;
}

/** Mirrors proposals.generation_state. */
export type GenerationState =
  | "queued"
  | "processing_profile"
  | "processing_document"
  | "validating"
  | "ready_for_review"
  | "needs_input"
  | "failed_retryable"
  | "failed_terminal";
