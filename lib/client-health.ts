import type { ClientHealth, DealEvent } from "@/lib/types";

interface HealthInput {
  /** Deal must still be active — health is meaningless once won or lost. */
  lastEventAt: string | null;
  /** True once a proposal has been shared with the client at least once. */
  hasSharedProposal: boolean;
  /** True if any deal_event of kind proposal_viewed exists. */
  hasViewedProposal: boolean;
  now?: Date;
}

/**
 * Cheap engagement heuristic, not a sentiment model — we don't run sentiment
 * analysis on transcripts, so this reads signals we already store: how long
 * since anything happened on the deal, and whether the client has actually
 * engaged with what was sent. A silent deal after a shared proposal is a
 * much stronger warning than a silent deal that's still at "lead".
 */
export function computeClientHealth(input: HealthInput): ClientHealth {
  const now = input.now ?? new Date();
  const reasons: string[] = [];
  let score = 100;

  const daysSinceActivity = input.lastEventAt
    ? (now.getTime() - new Date(input.lastEventAt).getTime()) / 86_400_000
    : null;

  if (daysSinceActivity == null) {
    reasons.push("No activity recorded yet");
    score -= 10;
  } else if (daysSinceActivity > 21) {
    reasons.push(`No activity in ${Math.round(daysSinceActivity)} days`);
    score -= 45;
  } else if (daysSinceActivity > 10) {
    reasons.push(`Quiet for ${Math.round(daysSinceActivity)} days`);
    score -= 20;
  }

  if (input.hasSharedProposal && !input.hasViewedProposal) {
    reasons.push("Proposal shared but never opened");
    score -= 25;
  }

  if (input.hasSharedProposal && input.hasViewedProposal) {
    reasons.push("Client has opened the proposal");
    score += 10;
  }

  score = Math.max(0, Math.min(100, score));

  const level = score >= 70 ? "healthy" : score >= 40 ? "cooling" : "at_risk";

  if (reasons.length === 0) reasons.push("Recently active, no warning signs");

  return { level, score, reasons };
}

/** Pulls the two signals computeClientHealth needs out of a deal's event feed. */
export function healthInputFromEvents(
  events: DealEvent[]
): Pick<HealthInput, "lastEventAt" | "hasSharedProposal" | "hasViewedProposal"> {
  const lastEventAt = events[0]?.created_at ?? null; // caller passes events sorted desc
  return {
    lastEventAt,
    hasSharedProposal: events.some((e) => e.kind === "proposal_shared"),
    hasViewedProposal: events.some((e) => e.kind === "proposal_viewed"),
  };
}
