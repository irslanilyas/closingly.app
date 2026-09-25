"use client";

import { formatCurrency } from "@/lib/format";
import { KIND_LABELS, PRIORITY_LABELS, type FollowUpKind } from "@/lib/follow-ups/rules";
import type { EngagementLevel } from "@/lib/deal-signals";
import { cn } from "@/lib/utils";
import type { DealOverview } from "@/app/api/deals/[id]/overview/route";
import { Reveal } from "./primitives";
import { PROPOSAL_SECTIONS } from "./proposal-sections";

const ENGAGEMENT_WORD: Record<EngagementLevel, string> = {
  engaged: "High",
  opened: "Medium",
  unopened: "Low",
  unsent: "Not sent yet",
  no_proposal: "No proposal",
};

/**
 * The four numbers that answer "where is this deal", read left to right:
 * what it is worth, what to do next, how engaged the client is, and how long
 * it has been sitting.
 */
export function StatStrip({ overview }: { overview: DealOverview }) {
  const { deal, signals, follow_up, proposal } = overview;
  const closed = deal.stage === "won" || deal.stage === "lost";

  const amount = deal.proposed_amount;
  const weighted = amount != null ? Math.round(amount * signals.stage_probability) : null;

  const actionKind = (follow_up?.kind ?? signals.next_action?.kind) as FollowUpKind | undefined;
  const actionValue = closed
    ? deal.stage === "won" ? "Won" : "Closed"
    : actionKind
      ? KIND_LABELS[actionKind]
      : "Nothing due";
  const actionHint = closed
    ? "No follow-up needed"
    : follow_up
      ? follow_up.draft_body ? "Draft ready to review" : "Being written"
      : signals.next_action
        ? PRIORITY_LABELS[signals.next_action.priority]
        : "You're on top of this one";

  const read = proposal?.tracking.sections_viewed.length ?? 0;
  const engagementHint = proposal?.tracking.total_views
    ? `${read} of ${PROPOSAL_SECTIONS.length} sections read · ${proposal.tracking.total_views} ${proposal.tracking.total_views === 1 ? "view" : "views"}`
    : proposal?.shared_at
      ? "Shared, waiting for a first read"
      : "Nothing sent to read yet";

  const stats = [
    {
      label: "Deal value",
      value: amount != null ? formatCurrency(amount) : "Not priced",
      hint:
        deal.estimated_hours != null
          ? `${deal.estimated_hours} hours estimated`
          : weighted != null && !closed
            ? `${formatCurrency(weighted)} at stage odds`
            : "Set a value to forecast it",
      tone: "default" as const,
    },
    { label: "Next best action", value: actionValue, hint: actionHint, tone: "default" as const },
    {
      label: "Client engagement",
      value: ENGAGEMENT_WORD[signals.engagement],
      hint: engagementHint,
      tone: signals.engagement === "engaged" ? ("good" as const) : ("default" as const),
    },
    {
      label: "Days in stage",
      value: String(signals.days_in_stage),
      hint: closed ? "Closed" : signals.stale ? "Longer than usual" : "Within a healthy range",
      tone: signals.stale ? ("warn" as const) : ("default" as const),
    },
  ];

  return (
    <div className="mb-5 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
      {stats.map((stat, i) => (
        <Reveal key={stat.label} index={i}>
          <div className="panel h-full px-4 py-3.5">
            <div className="text-[11px] text-muted-foreground">{stat.label}</div>
            <div
              className={cn(
                "mt-1.5 truncate text-[18px] font-medium leading-tight tracking-[-0.03em] tabular-nums sm:text-[19px]",
                stat.tone === "good" && "text-success",
                stat.tone === "warn" && "text-[color-mix(in_oklch,var(--warning),black_25%)] dark:text-warning"
              )}
            >
              {stat.value}
            </div>
            <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{stat.hint}</div>
          </div>
        </Reveal>
      ))}
    </div>
  );
}
