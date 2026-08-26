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
  proposal: ProposalData;
  suggested_replies: SuggestedReply[];
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
  responseStatus?: string;
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
  transcript_fetched_at: string | null;
  recording_seconds: number | null;
  meeting_kind: MeetingKind | null;
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
  | "note_added";

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
export type JobKind = "process_transcript";

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
