"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { describeDealEvent } from "@/lib/deal-events";
import type { DealEvent } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

/**
 * Reads the deal_events table the meeting pipeline and share flow write to.
 * The old sidebar showed only created_at and updated_at, which meant a deal
 * that had been recorded, drafted and shared looked identical to an empty one.
 *
 * Icons and wording come from lib/deal-events — shared with the dashboard
 * rail so the same event never reads differently in two places.
 */
export function ActivityPanel({ dealId }: { dealId: string }) {
  const [events, setEvents] = useState<DealEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("deal_events")
      .select("*")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setEvents(data as DealEvent[]);
        setLoading(false);
      });
  }, [dealId]);

  if (loading || events.length === 0) {
    return (
      <p className="text-[12.5px] text-muted-foreground">
        {loading ? "Loading…" : "Nothing has happened on this deal yet."}
      </p>
    );
  }

  return (
    <ol className="relative space-y-5">
      {events.map((event, i) => {
        const { Icon, label, tone } = describeDealEvent(event);
        const isLast = i === events.length - 1;

        return (
          <li key={event.id} className="relative flex gap-3.5">
            {!isLast && (
              <span
                aria-hidden
                className="absolute left-[11px] top-6 bottom-[-20px] w-px bg-border"
              />
            )}
            <span
              className={cn(
                "relative z-10 grid size-[22px] shrink-0 place-items-center rounded-full border bg-card",
                tone === "accent"
                  ? "border-[var(--brand)]/40 text-[var(--brand)]"
                  : "border-border text-muted-foreground"
              )}
            >
              <Icon className="size-3" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 pt-0.5">
              <div className="text-[13px] leading-snug">{label}</div>
              <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                {formatDistanceToNow(new Date(event.created_at), {
                  addSuffix: true,
                })}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
