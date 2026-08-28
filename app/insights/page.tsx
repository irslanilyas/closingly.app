"use client";

import { useEffect, useState } from "react";
import { AppShellClient } from "@/components/app-shell-client";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CapacityInsights, WinLossInsights } from "@/lib/types";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";

export default function InsightsPage() {
  const [winLoss, setWinLoss] = useState<WinLossInsights | null>(null);
  const [capacity, setCapacity] = useState<CapacityInsights | null>(null);

  useEffect(() => {
    fetch("/api/insights/win-loss")
      .then((r) => r.json())
      .then(setWinLoss)
      .catch(() => toast.error("Couldn't load win/loss insights."));
    fetch("/api/insights/capacity")
      .then((r) => r.json())
      .then(setCapacity)
      .catch(() => toast.error("Couldn't load capacity insights."));
  }, []);

  return (
    <AppShellClient>
      <PageHeader
        eyebrow="Insights"
        title="What your pipeline is telling you"
        description="Learned from your own closed deals and committed hours — not generic advice."
      />

      <div className="space-y-12 max-w-[900px]">
        <section>
          <SectionTitle>Win / loss</SectionTitle>
          {winLoss === null ? (
            <Skeleton className="h-[200px] w-full rounded-lg" />
          ) : winLoss.insufficient_data ? (
            <EmptyCard>
              Not enough closed deals yet — {winLoss.closed_count} of{" "}
              {winLoss.needed} needed. Once you&rsquo;ve won or lost a few
              more, this fills in on its own.
            </EmptyCard>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <StageCard label="Won" tone="accent" stats={winLoss.won} />
                <StageCard label="Lost" tone="neutral" stats={winLoss.lost} />
              </div>

              {winLoss.by_template.length > 0 && (
                <div className="rounded-lg border border-border bg-card overflow-hidden">
                  <div className="px-5 py-3 border-b border-border text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                    Win rate by proposal template
                  </div>
                  <div className="divide-y divide-border">
                    {winLoss.by_template.map((t) => (
                      <div
                        key={t.template_id}
                        className="flex items-center justify-between px-5 py-3"
                      >
                        <div className="text-[13px]">{t.template_name}</div>
                        <div className="flex items-center gap-3">
                          <span className="text-[11.5px] text-muted-foreground tabular-nums">
                            {t.won}W / {t.lost}L
                          </span>
                          <span className="text-[13px] font-medium tabular-nums text-[var(--accent-sage)]">
                            {Math.round(t.win_rate * 100)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <section>
          <SectionTitle>Capacity, next 12 weeks</SectionTitle>
          {capacity === null ? (
            <Skeleton className="h-[220px] w-full rounded-lg" />
          ) : (
            <div className="space-y-4">
              {capacity.unscheduled_deal_count > 0 && (
                <p className="text-[12px] text-muted-foreground">
                  {capacity.unscheduled_deal_count} won deal
                  {capacity.unscheduled_deal_count === 1 ? "" : "s"} missing
                  hours or dates — add them in Details to include here.
                </p>
              )}
              <div className="rounded-lg border border-border bg-card p-5 space-y-2.5">
                {capacity.weeks.map((w) => {
                  const pct = Math.min(
                    100,
                    (w.hours_committed / Math.max(1, w.capacity_hours)) * 100
                  );
                  return (
                    <div key={w.week_start} className="flex items-center gap-3">
                      <div className="w-16 shrink-0 text-[11px] text-muted-foreground tabular-nums">
                        {format(parseISO(w.week_start), "MMM d")}
                      </div>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            w.over_capacity
                              ? "bg-destructive"
                              : "bg-[var(--accent-sage)]"
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div
                        className={cn(
                          "w-24 shrink-0 text-[11px] text-right tabular-nums",
                          w.over_capacity
                            ? "text-destructive font-medium"
                            : "text-muted-foreground"
                        )}
                      >
                        {w.hours_committed}h / {w.capacity_hours}h
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>
    </AppShellClient>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[15px] font-medium tracking-tight mb-4">{children}</h2>
  );
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card px-6 py-10 text-center">
      <p className="text-[13px] text-muted-foreground max-w-[380px] mx-auto leading-relaxed">
        {children}
      </p>
    </div>
  );
}

function StageCard({
  label,
  tone,
  stats,
}: {
  label: string;
  tone: "accent" | "neutral";
  stats: {
    count: number;
    avg_proposed_amount: number | null;
    avg_followups: number;
    avg_days_to_close: number | null;
  };
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-baseline justify-between mb-4">
        <span
          className={cn(
            "text-[13px] font-medium",
            tone === "accent" && "text-[var(--accent-sage)]"
          )}
        >
          {label}
        </span>
        <span className="text-[11.5px] text-muted-foreground tabular-nums">
          {stats.count} deal{stats.count === 1 ? "" : "s"}
        </span>
      </div>
      <div className="space-y-2.5">
        <Metric label="Avg value" value={formatCurrency(stats.avg_proposed_amount)} />
        <Metric
          label="Avg follow-ups sent"
          value={stats.avg_followups.toFixed(1)}
        />
        <Metric
          label="Avg days to close"
          value={
            stats.avg_days_to_close != null
              ? Math.round(stats.avg_days_to_close).toString()
              : "—"
          }
        />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="text-[13px] font-medium tabular-nums">{value}</span>
    </div>
  );
}
