"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { AnimatePresence, motion } from "motion/react";
import { ChartBarIcon } from "@heroicons/react/24/outline";
import { describeDealEvent } from "@/lib/deal-events";
import { cn } from "@/lib/utils";
import type { DealOverview } from "@/app/api/deals/[id]/overview/route";
import { HubCard } from "./primitives";
import { PROPOSAL_SECTIONS } from "./proposal-sections";

const SHOWN = 5;

function readingTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * What the client did with the proposal, then everything else that happened.
 *
 * The section bar is the part consultants look at: which parts were read says
 * more about where the client's head is than any view count. Reading the
 * investment section twice and nothing else is a price conversation.
 */
export function TrackingCard({ overview }: { overview: DealOverview }) {
  const { proposal, events } = overview;
  const [expanded, setExpanded] = useState(false);
  const tracking = proposal?.tracking;
  const read = new Set(tracking?.sections_viewed ?? []);

  const title = !proposal
    ? "Nothing sent yet."
    : !proposal.shared_at
      ? "Drafted, not shared yet."
      : !tracking?.total_views
        ? "Shared. Waiting for the first read."
        : `${read.size} of ${PROPOSAL_SECTIONS.length} sections read.`;

  const visible = expanded ? events : events.slice(0, SHOWN);

  return (
    <HubCard id="tracking" eyebrow="Proposal tracking" icon={ChartBarIcon} title={title}>
      {proposal?.shared_at && (
        <>
          <div className="mt-4 flex gap-1" aria-label={`${read.size} of ${PROPOSAL_SECTIONS.length} sections read`}>
            {PROPOSAL_SECTIONS.map((section, i) => (
              <div key={section.key} className="group relative flex-1">
                <motion.div
                  className={cn("h-1.5 rounded-full", read.has(section.key) ? "bg-brand" : "bg-muted")}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.4, delay: 0.15 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                  style={{ originX: 0 }}
                />
                <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-1.5 py-0.5 text-[10.5px] text-background opacity-0 transition-opacity group-hover:opacity-100">
                  {section.title}
                </span>
              </div>
            ))}
          </div>

          {!!tracking?.total_views && (
            <dl className="mt-4 grid grid-cols-3 gap-2 text-[12px]">
              <div>
                <dt className="text-muted-foreground">Views</dt>
                <dd className="mt-0.5 text-[15px] font-medium tabular-nums">{tracking.total_views}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Readers</dt>
                <dd className="mt-0.5 text-[15px] font-medium tabular-nums">{Math.max(1, tracking.unique_viewers)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Time reading</dt>
                <dd className="mt-0.5 text-[15px] font-medium tabular-nums">{readingTime(tracking.total_seconds)}</dd>
              </div>
            </dl>
          )}
          {tracking?.last_viewed_at && (
            <p className="mt-3 text-[11.5px] text-muted-foreground">
              Last opened {formatDistanceToNow(new Date(tracking.last_viewed_at), { addSuffix: true })}
            </p>
          )}
        </>
      )}

      <div className="mt-5 border-t border-border pt-4">
        <div className="mb-3 text-[11.5px] font-medium text-muted-foreground">Deal activity</div>
        {events.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">Nothing has happened on this deal yet.</p>
        ) : (
          <ol className="relative space-y-4">
            <AnimatePresence initial={false}>
              {visible.map((event, i) => {
                const { Icon, label, tone } = describeDealEvent(event);
                return (
                  <motion.li
                    key={event.id}
                    layout
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="relative flex gap-3"
                  >
                    {i < visible.length - 1 && (
                      <span aria-hidden className="absolute bottom-[-16px] left-[10px] top-6 w-px bg-border" />
                    )}
                    <span
                      className={cn(
                        "relative z-10 grid size-[21px] shrink-0 place-items-center rounded-full border bg-card",
                        tone === "accent" ? "border-brand/40 text-brand" : "border-border text-muted-foreground"
                      )}
                    >
                      <Icon className="size-3" strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0 pt-px">
                      <div className="text-[12.5px] leading-snug">{label}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ol>
        )}
        {events.length > SHOWN && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-3 text-[12px] font-medium text-brand hover:underline"
          >
            {expanded ? "Show less" : `Show ${events.length - SHOWN} more`}
          </button>
        )}
      </div>
    </HubCard>
  );
}
