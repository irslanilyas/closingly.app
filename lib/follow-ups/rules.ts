import type { DealStage } from "@/lib/types";

/**
 * What deserves a nudge, and why.
 *
 * Deliberately a pure function over a snapshot: the rules are the product's
 * opinion about selling, and an opinion you cannot test is a guess. Everything
 * that touches the database lives in the sweep that calls this.
 *
 * Two design rules hold the whole thing together:
 *
 *   1. Every item states its reason in the user's own terms. A queue of
 *      unexplained tasks gets abandoned within a week.
 *   2. Every item carries a stable `dedupe_key`, so a sweep that runs hourly
 *      raises each situation once rather than sixty times a day.
 */

export interface DealSnapshot {
  id: string;
  client_name: string | null;
  client_company: string | null;
  stage: DealStage;
  proposed_amount: number | null;
  created_at: string;
  updated_at: string;
  /** Most recent deal_event timestamp, or null if nothing ever happened. */
  last_activity_at: string | null;
  /** Latest proposal on this deal, if one exists. */
  proposal: {
    id: string;
    shared_at: string | null;
    /** Most recent proposal_view, or null if the client never opened it. */
    last_viewed_at: string | null;
    view_count: number;
  } | null;
}

export type FollowUpKind =
  | "nudge"
  | "proposal_chase"
  | "unanswered_question"
  | "check_in"
  | "scope_risk"
  | "custom";

export interface RaisedFollowUp {
  deal_id: string;
  kind: FollowUpKind;
  reason: string;
  /** 1 highest. Only 1 is allowed to interrupt; 3 is a background suggestion. */
  priority: 1 | 2 | 3;
  dedupe_key: string;
  due_at: string;
}

/* ── Thresholds ────────────────────────────────────────────────────────────
   Numbers chosen to be slightly impatient, because the failure mode that
   actually loses deals is waiting too long, not chasing too early. They are
   exported so the tests assert against the same values the sweep uses.     */

/** A proposal that has sat unopened this long is probably buried. */
export const UNOPENED_DAYS = 3;
/** Opened, read, and then silence. This is the highest-yield nudge there is. */
export const OPENED_NO_REPLY_DAYS = 2;
/** An active deal with nothing recorded against it for this long has stalled. */
export const STALLED_DAYS = 10;
/** A lead that never became a proposal. */
export const LEAD_COLD_DAYS = 5;
/** Won work goes quiet; this is when a check-in is worth sending. */
export const WON_QUIET_DAYS = 21;

const DAY_MS = 86_400_000;

/** Stages where chasing is still useful. Won and lost are not being sold. */
const ACTIVE_STAGES: DealStage[] = ["lead", "proposal_sent", "negotiating"];

function daysBetween(from: string, now: Date): number {
  return (now.getTime() - new Date(from).getTime()) / DAY_MS;
}

function nameOf(deal: DealSnapshot): string {
  return (
    deal.client_company?.trim() ||
    deal.client_name?.trim() ||
    "this client"
  );
}

/** Whole days, phrased the way a person would say it. */
function agoPhrase(days: number): string {
  const whole = Math.floor(days);
  if (whole <= 1) return "yesterday";
  if (whole < 14) return `${whole} days ago`;
  if (whole < 60) return `${Math.floor(whole / 7)} weeks ago`;
  return `${Math.floor(whole / 30)} months ago`;
}

/**
 * Runs every rule against one deal and returns everything it raises.
 *
 * A deal can legitimately raise more than one item — a proposal going unread
 * and the deal having stalled are different problems with different fixes —
 * but the caller keeps only the highest-priority one per deal so the queue
 * stays a list of next actions rather than a list of symptoms.
 */
export function raiseForDeal(deal: DealSnapshot, now: Date): RaisedFollowUp[] {
  const raised: RaisedFollowUp[] = [];
  const who = nameOf(deal);
  const due = now.toISOString();

  if (deal.stage === "lost") return raised;

  // ── Won work that has gone quiet ────────────────────────────────────────
  if (deal.stage === "won") {
    const quiet = daysBetween(deal.last_activity_at ?? deal.updated_at, now);
    if (quiet >= WON_QUIET_DAYS) {
      raised.push({
        deal_id: deal.id,
        kind: "check_in",
        reason: `${who} has been quiet since ${agoPhrase(quiet)}. A check-in on live work is how the next project starts.`,
        priority: 3,
        dedupe_key: `check_in:${deal.id}:${Math.floor(quiet / WON_QUIET_DAYS)}`,
        due_at: due,
      });
    }
    return raised;
  }

  if (!ACTIVE_STAGES.includes(deal.stage)) return raised;

  const proposal = deal.proposal;

  // ── Sent and never opened ───────────────────────────────────────────────
  if (proposal?.shared_at && proposal.view_count === 0) {
    const waiting = daysBetween(proposal.shared_at, now);
    if (waiting >= UNOPENED_DAYS) {
      raised.push({
        deal_id: deal.id,
        kind: "proposal_chase",
        reason: `The proposal went to ${who} ${agoPhrase(waiting)} and has never been opened. Worth checking it reached the right inbox.`,
        priority: 1,
        dedupe_key: `unopened:${proposal.id}`,
        due_at: due,
      });
    }
  }

  // ── Opened, then silence ────────────────────────────────────────────────
  // The strongest signal in the product: they read it and did not reply.
  if (proposal?.last_viewed_at && proposal.view_count > 0) {
    const sinceRead = daysBetween(proposal.last_viewed_at, now);
    const movedSince =
      deal.last_activity_at != null &&
      new Date(deal.last_activity_at) > new Date(proposal.last_viewed_at);

    if (sinceRead >= OPENED_NO_REPLY_DAYS && !movedSince) {
      raised.push({
        deal_id: deal.id,
        kind: "nudge",
        reason: `${who} opened the proposal ${agoPhrase(sinceRead)}${
          proposal.view_count > 1 ? ` and has been back ${proposal.view_count} times` : ""
        }, and nothing has moved since. They are thinking about it.`,
        priority: 1,
        dedupe_key: `read_silence:${proposal.id}:${Math.floor(sinceRead / OPENED_NO_REPLY_DAYS)}`,
        due_at: due,
      });
    }
  }

  // ── A lead that never got a proposal ────────────────────────────────────
  if (deal.stage === "lead" && !proposal) {
    const age = daysBetween(deal.created_at, now);
    if (age >= LEAD_COLD_DAYS) {
      raised.push({
        deal_id: deal.id,
        kind: "nudge",
        reason: `You spoke to ${who} ${agoPhrase(age)} and never sent anything. The conversation is still warm enough to use.`,
        priority: 2,
        dedupe_key: `no_proposal:${deal.id}:${Math.floor(age / LEAD_COLD_DAYS)}`,
        due_at: due,
      });
    }
  }

  // ── Stalled ─────────────────────────────────────────────────────────────
  const idle = daysBetween(deal.last_activity_at ?? deal.created_at, now);
  if (idle >= STALLED_DAYS) {
    raised.push({
      deal_id: deal.id,
      kind: "nudge",
      reason: `Nothing has happened on ${who} since ${agoPhrase(idle)}. Deals this quiet usually need one direct question, not another follow-up.`,
      priority: 2,
      dedupe_key: `stalled:${deal.id}:${Math.floor(idle / STALLED_DAYS)}`,
      due_at: due,
    });
  }

  return raised;
}

/**
 * The whole sweep, as a pure transformation.
 *
 * Keeps one item per deal — the most urgent — because a queue that shows three
 * rows for the same client is a queue nobody trusts. Ties break toward the
 * proposal-related item, which is the one with a concrete next action.
 */
export function raiseAll(
  deals: DealSnapshot[],
  now: Date = new Date()
): RaisedFollowUp[] {
  const best = new Map<string, RaisedFollowUp>();

  for (const deal of deals) {
    for (const item of raiseForDeal(deal, now)) {
      const current = best.get(item.deal_id);
      if (!current || item.priority < current.priority) {
        best.set(item.deal_id, item);
      }
    }
  }

  return [...best.values()].sort((a, b) => a.priority - b.priority);
}

/** Copy for the queue's grouping headers. */
export const PRIORITY_LABELS: Record<1 | 2 | 3, string> = {
  1: "Today",
  2: "This week",
  3: "When you have time",
};

export const KIND_LABELS: Record<FollowUpKind, string> = {
  nudge: "Nudge",
  proposal_chase: "Chase proposal",
  unanswered_question: "Answer a question",
  check_in: "Check in",
  scope_risk: "Scope risk",
  custom: "Follow-up",
};
