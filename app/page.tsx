"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShellClient } from "@/components/app-shell-client";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/format";
import {
  type Deal,
  type DealEvent,
  type Meeting,
  STAGE_LABELS,
  STAGE_ORDER,
  STAGE_PROBABILITY,
} from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { ArrowRight, Video, CalendarClock } from "lucide-react";

/**
 * Pipeline-first. This used to be a launcher of seven module cards, which made
 * sense while each module was a separate thing to try — but the modules are
 * panels on a deal now, so the useful landing view is the work itself.
 */
export default function DashboardPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [events, setEvents] = useState<DealEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    Promise.all([
      supabase.from("deals").select("*").order("updated_at", { ascending: false }),
      supabase
        .from("meetings")
        .select("*")
        .gte("starts_at", now.toISOString())
        .lte("starts_at", endOfDay.toISOString())
        .order("starts_at", { ascending: true }),
      supabase
        .from("deal_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(8),
    ]).then(([dealsRes, meetingsRes, eventsRes]) => {
      if (dealsRes.data) setDeals(dealsRes.data as Deal[]);
      if (meetingsRes.data) setMeetings(meetingsRes.data as Meeting[]);
      if (eventsRes.data) setEvents(eventsRes.data as DealEvent[]);
      setLoading(false);
    });
  }, []);

  const stats = useMemo(() => {
    const open = deals.filter((d) => d.stage !== "won" && d.stage !== "lost");
    const total = open.reduce((sum, d) => sum + (d.proposed_amount ?? 0), 0);
    // Weighted by how likely each stage is to close, so the number means
    // something rather than being an optimistic sum of everything in flight.
    const weighted = open.reduce(
      (sum, d) =>
        sum + (d.proposed_amount ?? 0) * (STAGE_PROBABILITY[d.stage] ?? 0),
      0
    );
    return { open: open.length, total, weighted };
  }, [deals]);

  const byStage = useMemo(
    () =>
      STAGE_ORDER.map((stage) => ({
        stage,
        count: deals.filter((d) => d.stage === stage).length,
      })),
    [deals]
  );

  return (
    <AppShellClient>
      <div className="mb-8">
        <h1 className="text-[24px] sm:text-[28px] font-medium tracking-tight leading-tight">
          {greeting()}
        </h1>
        <p className="mt-1.5 text-[13.5px] text-muted-foreground">
          {loading
            ? " "
            : stats.open === 0
              ? "Nothing in the pipeline yet — switch the agent on for a call and it fills itself."
              : `${stats.open} open ${stats.open === 1 ? "deal" : "deals"} worth ${formatCurrency(stats.total)}.`}
        </p>
      </div>

      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-[92px] w-full rounded-md" />
          <Skeleton className="h-[200px] w-full rounded-md" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8 lg:gap-12">
          <div className="space-y-10 min-w-0">
            <section className="grid grid-cols-3 gap-4">
              <Stat label="Open deals" value={String(stats.open)} />
              <Stat label="Pipeline" value={formatCurrency(stats.total)} />
              <Stat
                label="Weighted"
                value={formatCurrency(Math.round(stats.weighted))}
                hint="By stage probability"
              />
            </section>

            <section>
              <SectionHead title="Pipeline" href="/pipeline" />
              {stats.open === 0 ? (
                <EmptyPipeline />
              ) : (
                <div className="rounded-md border border-border divide-y divide-border">
                  {byStage
                    .filter((s) => s.count > 0)
                    .map(({ stage, count }) => (
                      <Link
                        key={stage}
                        href="/pipeline"
                        className="flex items-center justify-between px-4 py-3 hover:bg-secondary/40 transition-colors"
                      >
                        <span className="text-[13px]">
                          {STAGE_LABELS[stage]}
                        </span>
                        <span className="text-[13px] tabular-nums text-muted-foreground">
                          {count}
                        </span>
                      </Link>
                    ))}
                </div>
              )}
            </section>

            <section>
              <SectionHead title="Today" href="/meetings" />
              {meetings.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground">
                  No more meetings today.
                </p>
              ) : (
                <div className="rounded-md border border-border divide-y divide-border">
                  {meetings.map((meeting) => (
                    <div
                      key={meeting.id}
                      className="flex items-center gap-4 px-4 py-3"
                    >
                      <span className="w-[62px] shrink-0 text-[12.5px] tabular-nums text-muted-foreground">
                        {meeting.starts_at
                          ? new Date(meeting.starts_at).toLocaleTimeString(
                              undefined,
                              { hour: "numeric", minute: "2-digit" }
                            )
                          : "—"}
                      </span>
                      <span className="min-w-0 flex-1 text-[13px] truncate">
                        {meeting.title ?? "Untitled meeting"}
                      </span>
                      {meeting.agent_enabled && (
                        <span className="flex items-center gap-1 shrink-0 text-[11px] uppercase tracking-[0.08em] text-[var(--accent-sage)] font-medium">
                          <Video className="size-3" strokeWidth={1.5} />
                          Agent on
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside>
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground mb-4 font-medium">
              Recent activity
            </div>
            {events.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">
                Nothing yet.
              </p>
            ) : (
              <ul className="space-y-3.5">
                {events.map((event) => (
                  <li key={event.id}>
                    <Link
                      href={`/pipeline/${event.deal_id}`}
                      className="group block"
                    >
                      <div className="text-[12.5px] leading-snug group-hover:text-foreground transition-colors">
                        {describeEvent(event)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(event.created_at), {
                          addSuffix: true,
                        })}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}
    </AppShellClient>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="text-[22px] font-medium tabular-nums tracking-tight">
        {value}
      </div>
      <div className="mt-0.5 text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </div>
      {hint && (
        <div className="mt-0.5 text-[10.5px] text-muted-foreground/70">
          {hint}
        </div>
      )}
    </div>
  );
}

function SectionHead({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
        {title}
      </div>
      <Link
        href={href}
        className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
      >
        View all
        <ArrowRight className="size-3" strokeWidth={1.5} />
      </Link>
    </div>
  );
}

function EmptyPipeline() {
  return (
    <div className="rounded-md border border-dashed border-border px-6 py-10 text-center">
      <CalendarClock
        className="size-5 mx-auto text-muted-foreground mb-3"
        strokeWidth={1.5}
      />
      <div className="text-[13.5px] font-medium">No deals yet</div>
      <p className="mt-1.5 mx-auto max-w-[380px] text-[12.5px] text-muted-foreground leading-relaxed">
        Switch the agent on for a client call and the deal, transcript and a
        drafted proposal all land here on their own.
      </p>
      <Link
        href="/meetings"
        className="mt-4 inline-block text-[12.5px] text-[var(--accent-sage)] hover:underline underline-offset-4"
      >
        Go to meetings
      </Link>
    </div>
  );
}

function describeEvent(event: DealEvent): string {
  switch (event.kind) {
    case "meeting_recorded":
      return `Recorded ${event.to_value ?? "a meeting"}`;
    case "proposal_drafted":
      return `Proposal drafted${event.to_value ? ` — ${event.to_value}` : ""}`;
    case "proposal_shared":
      return "Share link created";
    case "proposal_viewed":
      return "Client opened a proposal";
    case "stage_changed":
      return `Moved to ${event.to_value}`;
    case "followup_generated":
      return "Follow-up drafted";
    default:
      return event.to_value ?? event.kind.replace(/_/g, " ");
  }
}
