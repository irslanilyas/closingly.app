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
  proposal_data: ProposalData | null;
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
