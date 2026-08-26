"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShellClient } from "@/components/app-shell-client";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/format";
import { describeDealEvent } from "@/lib/deal-events";
import {
  type Deal,
  type DealEvent,
  type DealStage,
  type Meeting,
  STAGE_LABELS,
  STAGE_ORDER,
  STAGE_PROBABILITY,
} from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  Eye,
  Link2,
  Video,
} from "lucide-react";

/** Open stages only — won/lost aren't "in flight" and shouldn't colour the bar. */
const OPEN_STAGES: DealStage[] = ["lead", "proposal_sent", "negotiating"];

/**
 * Each open stage gets its own step on the sage ramp, darkening as the deal
 * gets closer to closing. Reading left to right, the bar gets darker as money
 * gets more real — the colour carries the same information as the order.
 */
const STAGE_FILL: Record<string, string> = {
  lead: "var(--chart-3)",
  proposal_sent: "var(--chart-2)",
  negotiating: "var(--chart-1)",
};

interface SharedProposal {
  id: string;
  deal_id: string;
  created_at: string;
  share_token: string | null;
}

export default function DashboardPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [events, setEvents] = useState<DealEvent[]>([]);
  const [shared, setShared] = useState<SharedProposal[]>([]);
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());
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
      supabase
        .from("proposals")
        .select("id, deal_id, created_at, share_token")
        .not("share_token", "is", null),
      supabase.from("proposal_views").select("proposal_id"),
    ]).then(([dealsRes, meetingsRes, eventsRes, sharedRes, viewsRes]) => {
      if (dealsRes.data) setDeals(dealsRes.data as Deal[]);
      if (meetingsRes.data) setMeetings(meetingsRes.data as Meeting[]);
      if (eventsRes.data) setEvents(eventsRes.data as DealEvent[]);
      if (sharedRes.data) setShared(sharedRes.data as SharedProposal[]);
      if (viewsRes.data) {
        setViewedIds(
          new Set(
            (viewsRes.data as { proposal_id: string }[]).map(
              (v) => v.proposal_id
            )
          )
        );
      }
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
      STAGE_ORDER.map((stage) => {
        const inStage = deals.filter((d) => d.stage === stage);
        return {
          stage,
          count: inStage.length,
          value: inStage.reduce((s, d) => s + (d.proposed_amount ?? 0), 0),
        };
      }),
    [deals]
  );

  const openByStage = useMemo(
    () => byStage.filter((s) => OPEN_STAGES.includes(s.stage) && s.count > 0),
    [byStage]
  );

  /**
   * A proposal that was shared and never opened is the one thing on this
   * screen the user can act on right now — everything else is a record of
   * something that already happened.
   */
  const awaiting = useMemo(() => {
    const dealById = new Map(deals.map((d) => [d.id, d]));
    return shared
      .filter((p) => !viewedIds.has(p.id))
      .map((p) => ({ proposal: p, deal: dealById.get(p.deal_id) }))
      .filter((row) => row.deal)
      .sort(
        (a, b) =>
          new Date(a.proposal.created_at).getTime() -
          new Date(b.proposal.created_at).getTime()
      );
  }, [shared, viewedIds, deals]);

  const openedCount = shared.filter((p) => viewedIds.has(p.id)).length;

  return (
    <AppShellClient>
      <div className="mb-8 animate-fade">
        <h1 className="text-[24px] sm:text-[28px] font-medium tracking-tight leading-tight">
          {greeting()}
        </h1>
        <p className="mt-1.5 text-[13.5px] text-muted-foreground">
          {loading ? (
            <span className="inline-block h-[1em] w-[240px] align-middle rounded bg-muted animate-pulse" />
          ) : stats.open === 0 ? (
            "Nothing in the pipeline yet — switch the agent on for a call and it fills itself."
          ) : (
            `${stats.open} open ${stats.open === 1 ? "deal" : "deals"} worth ${formatCurrency(stats.total)}.`
          )}
        </p>
      </div>

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8 lg:gap-12">
          <div className="space-y-10 min-w-0">
            <section className="grid grid-cols-3 gap-3 sm:gap-4 stagger">
              <Stat label="Open deals" value={String(stats.open)} />
              <Stat label="Pipeline" value={formatCurrency(stats.total)} />
              <Stat
                label="Weighted"
                value={formatCurrency(Math.round(stats.weighted))}
                hint="By stage probability"
                accent
              />
            </section>

            <section className="animate-rise" style={{ animationDelay: "80ms" }}>
              <SectionHead title="Pipeline" href="/pipeline" />
              {stats.open === 0 ? (
                <EmptyPipeline />
              ) : (
                <div className="rounded-lg border border-border bg-card overflow-hidden">
                  <StageBar segments={openByStage} total={stats.open} />
                  <div className="divide-y divide-border">
                    {byStage
                      .filter((s) => s.count > 0)
                      .map(({ stage, count, value }) => (
                        <Link
                          key={stage}
                          href="/pipeline"
                          className="group flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors focus-visible:outline-none focus-visible:bg-secondary/50"
                        >
                          <span
                            aria-hidden
                            className="size-2 rounded-full shrink-0 ring-2 ring-transparent transition-all group-hover:ring-current/10"
                            style={{
                              background:
                                STAGE_FILL[stage] ?? "var(--muted-foreground)",
                            }}
                          />
                          <span className="text-[13px] flex-1 min-w-0 truncate">
                            {STAGE_LABELS[stage]}
                          </span>
                          {value > 0 && (
                            <span className="text-[12.5px] tabular-nums text-muted-foreground">
                              {formatCurrency(value)}
                            </span>
                          )}
                          <span className="w-6 text-right text-[13px] tabular-nums font-medium">
                            {count}
                          </span>
                        </Link>
                      ))}
                  </div>
                </div>
              )}
            </section>

            {shared.length > 0 && (
              <section
                className="animate-rise"
                style={{ animationDelay: "120ms" }}
              >
                <SectionHead title="Proposals out" />
                <div className="rounded-lg border border-border bg-card">
                  <div className="flex items-center gap-5 px-4 py-3.5 border-b border-border">
                    <MiniStat
                      icon={Link2}
                      value={shared.length}
                      label={`shared`}
                    />
                    <MiniStat
                      icon={Eye}
                      value={openedCount}
                      label="opened"
                      accent={openedCount > 0}
                    />
                  </div>

                  {awaiting.length === 0 ? (
                    <p className="px-4 py-3.5 text-[12.5px] text-muted-foreground">
                      Every proposal you&rsquo;ve shared has been opened.
                    </p>
                  ) : (
                    <div className="divide-y divide-border">
                      {awaiting.slice(0, 3).map(({ proposal, deal }) => (
                        <Link
                          key={proposal.id}
                          href={`/proposals/${proposal.id}`}
                          className="group flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] truncate">
                              {deal?.client_company ??
                                deal?.client_name ??
                                "Untitled deal"}
                            </span>
                            <span className="block mt-0.5 text-[11.5px] text-muted-foreground">
                              Sent{" "}
                              {formatDistanceToNow(
                                new Date(proposal.created_at),
                                { addSuffix: true }
                              )}{" "}
                              · not opened yet
                            </span>
                          </span>
                          <ArrowUpRight
                            className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors"
                            strokeWidth={1.5}
                          />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}

            <section className="animate-rise" style={{ animationDelay: "160ms" }}>
              <SectionHead title="Today" href="/meetings" />
              {meetings.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground">
                  No more meetings today.
                </p>
              ) : (
                <div className="rounded-lg border border-border bg-card divide-y divide-border">
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
                        <span className="flex items-center gap-1.5 shrink-0 text-[11px] uppercase tracking-[0.08em] text-[var(--accent-sage)] font-medium">
                          <span className="relative flex size-1.5">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--accent-sage)] opacity-60 animate-ping" />
                            <span className="relative inline-flex size-1.5 rounded-full bg-[var(--accent-sage)]" />
                          </span>
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

          <aside className="animate-rise" style={{ animationDelay: "200ms" }}>
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground mb-4 font-medium">
              Recent activity
            </div>
            {events.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">Nothing yet.</p>
            ) : (
              <ol className="relative stagger">
                {events.map((event, i) => {
                  const { Icon, label, tone } = describeDealEvent(
                    event,
                    "plain"
                  );
                  const isLast = i === events.length - 1;

                  return (
                    <li key={event.id} className="relative flex gap-3 pb-4">
                      {!isLast && (
                        <span
                          aria-hidden
                          className="absolute left-[11px] top-[22px] bottom-0 w-px bg-border"
                        />
                      )}
                      <span
                        className={cn(
                          "relative z-10 mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-full border bg-card transition-colors",
                          tone === "accent"
                            ? "border-[var(--accent-sage)]/40 text-[var(--accent-sage)]"
                            : "border-border text-muted-foreground"
                        )}
                      >
                        <Icon className="size-3" strokeWidth={1.75} />
                      </span>
                      <Link
                        href={`/pipeline/${event.deal_id}`}
                        className="group min-w-0 flex-1"
                      >
                        <div className="text-[12.5px] leading-snug group-hover:text-foreground text-foreground/90 transition-colors">
                          {label}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {formatDistanceToNow(new Date(event.created_at), {
                            addSuffix: true,
                          })}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ol>
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

/**
 * Proportional stage distribution. Reads as one continuous bar rather than
 * separate blocks — the pipeline is one quantity split up, not three things.
 */
function StageBar({
  segments,
  total,
}: {
  segments: { stage: DealStage; count: number }[];
  total: number;
}) {
  if (total === 0 || segments.length === 0) return null;

  return (
    <div
      className="flex h-1.5 w-full overflow-hidden bg-muted"
      role="img"
      aria-label={segments
        .map((s) => `${s.count} ${STAGE_LABELS[s.stage]}`)
        .join(", ")}
    >
      {segments.map(({ stage, count }, i) => (
        <span
          key={stage}
          className="animate-grow-x h-full"
          style={{
            width: `${(count / total) * 100}%`,
            background: STAGE_FILL[stage] ?? "var(--muted-foreground)",
            animationDelay: `${160 + i * 90}ms`,
          }}
        />
      ))}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3.5 py-3.5 sm:px-4 lift hover:border-muted-foreground/25">
      <div
        className={cn(
          "text-[19px] sm:text-[22px] font-medium tabular-nums tracking-tight leading-none",
          accent && "text-[var(--accent-sage)]"
        )}
      >
        {value}
      </div>
      <div className="mt-2 text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </div>
      {hint && (
        <div className="mt-0.5 text-[10.5px] text-muted-foreground/70 hidden sm:block">
          {hint}
        </div>
      )}
    </div>
  );
}

function MiniStat({
  icon: Icon,
  value,
  label,
  accent,
}: {
  icon: typeof Eye;
  value: number;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon
        className={cn(
          "size-3.5",
          accent ? "text-[var(--accent-sage)]" : "text-muted-foreground"
        )}
        strokeWidth={1.5}
      />
      <span className="text-[13px] tabular-nums font-medium">{value}</span>
      <span className="text-[12.5px] text-muted-foreground">{label}</span>
    </div>
  );
}

function SectionHead({ title, href }: { title: string; href?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
        {title}
      </div>
      {href && (
        <Link
          href={href}
          className="group flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
        >
          View all
          <ArrowRight
            className="size-3 transition-transform group-hover:translate-x-0.5"
            strokeWidth={1.5}
          />
        </Link>
      )}
    </div>
  );
}

function EmptyPipeline() {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
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
        className="group mt-4 inline-flex items-center gap-1 text-[12.5px] text-[var(--accent-sage)] hover:underline underline-offset-4"
      >
        Go to meetings
        <ArrowRight
          className="size-3 transition-transform group-hover:translate-x-0.5"
          strokeWidth={1.5}
        />
      </Link>
    </div>
  );
}

/**
 * Mirrors the real layout rather than showing generic blocks — the content
 * lands in the same place the skeleton reserved, so nothing jumps.
 */
function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8 lg:gap-12">
      <div className="space-y-10">
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px] rounded-lg" />
          ))}
        </div>
        <div>
          <Skeleton className="h-3 w-16 mb-3 rounded" />
          <Skeleton className="h-[132px] w-full rounded-lg" />
        </div>
        <div>
          <Skeleton className="h-3 w-16 mb-3 rounded" />
          <Skeleton className="h-[88px] w-full rounded-lg" />
        </div>
      </div>
      <div>
        <Skeleton className="h-3 w-24 mb-4 rounded" />
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-[22px] rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-full rounded" />
                <Skeleton className="h-2.5 w-16 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
