import { raiseForDeal, STALLED_DAYS, type FollowUpKind } from "@/lib/follow-ups/rules";
import type { EnrichedSnapshot } from "@/lib/follow-ups/snapshot";

/**
 * What a deal's snapshot means, derived once.
 *
 * The pipeline board and the deal page both answer "how engaged is this client
 * and what should happen next". Deriving it in one place is what stops the two
 * from ever telling someone different things about the same deal.
 */

export type EngagementLevel =
  | "no_proposal"
  | "unsent"
  | "unopened"
  | "opened"
  | "engaged";

export const ENGAGEMENT_LABELS: Record<EngagementLevel, string> = {
  no_proposal: "No proposal yet",
  unsent: "Drafted, not sent",
  unopened: "Sent, never opened",
  opened: "Opened",
  engaged: "Reading it repeatedly",
};

export interface NextAction {
  reason: string;
  priority: 1 | 2 | 3;
  kind: FollowUpKind;
}

const DAY_MS = 86_400_000;

export function daysSince(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY_MS));
}

export function engagementOf(snapshot: EnrichedSnapshot): EngagementLevel {
  const proposal = snapshot.proposal;
  if (!proposal) return "no_proposal";
  if (!proposal.shared_at) return "unsent";
  if (proposal.view_count === 0) return "unopened";
  return proposal.view_count > 2 ? "engaged" : "opened";
}

/**
 * The single most important thing the rules say, or null.
 *
 * Closed deals get none: telling someone to chase a deal they already won is
 * how a product loses trust in one glance.
 */
export function nextActionOf(
  snapshot: EnrichedSnapshot,
  now = new Date()
): NextAction | null {
  if (snapshot.stage === "won" || snapshot.stage === "lost") return null;
  const top = raiseForDeal(snapshot, now).sort(
    (a, b) => a.priority - b.priority
  )[0];
  return top ? { reason: top.reason, priority: top.priority, kind: top.kind } : null;
}

/** Past the stall threshold, a stage stops being a stage and starts being a problem. */
export function stageIsStale(daysInStage: number): boolean {
  return daysInStage >= STALLED_DAYS;
}
