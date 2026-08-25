"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { DealEvent, DealEventKind } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import {
  CircleDot,
  FileText,
  Link2,
  Eye,
  Mic,
  Mail,
  StickyNote,
  ArrowRight,
} from "lucide-react";

/**
 * Reads the deal_events table the meeting pipeline and share flow write to.
 * The old sidebar showed only created_at and updated_at, which meant a deal
 * that had been recorded, drafted and shared looked identical to an empty one.
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
        const { Icon, label } = describe(event);
        const isLast = i === events.length - 1;

        return (
          <li key={event.id} className="relative flex gap-3.5">
            {!isLast && (
              <span
                aria-hidden
                className="absolute left-[11px] top-6 bottom-[-20px] w-px bg-border"
              />
            )}
            <span className="relative z-10 size-[22px] shrink-0 rounded-full border border-border bg-card flex items-center justify-center">
              <Icon className="size-3 text-muted-foreground" strokeWidth={1.5} />
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

const ICONS: Record<DealEventKind, typeof CircleDot> = {
  created: CircleDot,
  stage_changed: ArrowRight,
  meeting_recorded: Mic,
  proposal_drafted: FileText,
  proposal_shared: Link2,
  proposal_viewed: Eye,
  followup_generated: Mail,
  note_added: StickyNote,
};

function describe(event: DealEvent): {
  Icon: typeof CircleDot;
  label: React.ReactNode;
} {
  const Icon = ICONS[event.kind] ?? CircleDot;

  switch (event.kind) {
    case "meeting_recorded":
      return {
        Icon,
        label: (
          <>
            Recorded <strong className="font-medium">{event.to_value}</strong>
          </>
        ),
      };
    case "proposal_drafted":
      return {
        Icon,
        label: (
          <>
            Proposal drafted
            {event.to_value ? (
              <>
                {" — "}
                <strong className="font-medium">{event.to_value}</strong>
              </>
            ) : null}
          </>
        ),
      };
    case "proposal_shared":
      return { Icon, label: "Share link created" };
    case "proposal_viewed":
      return { Icon, label: "Client opened the proposal" };
    case "stage_changed":
      return {
        Icon,
        label: (
          <>
            Moved to{" "}
            <strong className="font-medium">{event.to_value}</strong>
          </>
        ),
      };
    case "followup_generated":
      return { Icon, label: "Follow-up drafted" };
    default:
      return { Icon, label: event.to_value ?? event.kind.replace(/_/g, " ") };
  }
}
