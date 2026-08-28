"use client";

import { useMemo } from "react";
import { StageBadge } from "@/components/stage-badge";
import { formatCurrency } from "@/lib/format";
import { type Deal, STAGE_PROBABILITY } from "@/lib/types";
import { addDays } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const BUCKETS = [
  { label: "Next 30 days", min: 0, max: 30 },
  { label: "31–60 days", min: 30, max: 60 },
  { label: "61–90 days", min: 60, max: 90 },
  { label: "90+ days", min: 90, max: Infinity },
];

/**
 * Rough expected close date, since nothing tracks a real one yet: assume a
 * deal closes about a month after it was created. Crude, but honest — and
 * the bucketing is only meant to answer "roughly when does this land",
 * not to be a commitment.
 */
const CYCLE_DAYS = 30;

/**
 * A third way to look at the pipeline, alongside Kanban and List.
 *
 * This used to be its own top-level page, which was the wrong shape: there's
 * no input and no AI here, it's arithmetic over deals the user already owns.
 * Making someone leave the pipeline to see their pipeline forecast was pure
 * navigation tax. It takes the same `deals` array the other two views get,
 * so switching between them costs nothing and never refetches.
 */
export function ForecastView({ deals }: { deals: Deal[] }) {
  const openDeals = useMemo(
    () => deals.filter((d) => d.stage !== "won" && d.stage !== "lost"),
    [deals]
  );

  const totals = useMemo(() => {
    const pipeline = openDeals.reduce(
      (s, d) => s + (d.proposed_amount ?? 0),
      0
    );
    const weighted = openDeals.reduce(
      (s, d) => s + (d.proposed_amount ?? 0) * STAGE_PROBABILITY[d.stage],
      0
    );
    const withAmount = deals.filter((d) => d.proposed_amount);
    const avg = withAmount.length
      ? withAmount.reduce((s, d) => s + (d.proposed_amount ?? 0), 0) /
        withAmount.length
      : 0;
    return { pipeline, weighted, avg };
  }, [openDeals, deals]);

  const chartData = useMemo(() => {
    const now = new Date();
    return BUCKETS.map((b) => {
      const dealsIn = openDeals.filter((d) => {
        const close = addDays(new Date(d.created_at), CYCLE_DAYS);
        const days = (close.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        return days >= b.min && days < b.max;
      });
      return {
        label: b.label,
        weighted: dealsIn.reduce(
          (s, d) => s + (d.proposed_amount ?? 0) * STAGE_PROBABILITY[d.stage],
          0
        ),
        count: dealsIn.length,
      };
    });
  }, [openDeals]);

  const rows = useMemo(
    () =>
      openDeals
        .map((d) => ({
          ...d,
          probability: STAGE_PROBABILITY[d.stage],
          weighted: (d.proposed_amount ?? 0) * STAGE_PROBABILITY[d.stage],
        }))
        .sort((a, b) => b.weighted - a.weighted),
    [openDeals]
  );

  if (openDeals.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/40 p-12 text-center">
        <div className="text-[13.5px] font-medium">Nothing to forecast yet</div>
        <div className="mt-1.5 text-[12.5px] text-muted-foreground">
          Open deals with an amount on them show up here, weighted by how
          likely their stage is to close.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 stagger">
        <Stat label="Total pipeline" value={formatCurrency(totals.pipeline)} />
        <Stat
          label="Weighted forecast"
          value={formatCurrency(Math.round(totals.weighted))}
          accent
        />
        <Stat label="Average deal size" value={formatCurrency(Math.round(totals.avg))} />
      </div>

      <div className="rounded-lg border border-border bg-card p-5 sm:p-6">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground mb-5 font-medium">
          Weighted revenue by close window
        </div>
        <div className="h-[200px] sm:h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 12, left: -12, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border)"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) =>
                  v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v
                }
              />
              <Tooltip
                cursor={{ fill: "var(--secondary)" }}
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value, _name, item) => {
                  const v = typeof value === "number" ? value : 0;
                  const count =
                    (item as { payload?: { count?: number } })?.payload
                      ?.count ?? 0;
                  return [
                    `${formatCurrency(v)} · ${count} deal${count === 1 ? "" : "s"}`,
                    "Weighted",
                  ];
                }}
              />
              <Bar
                dataKey="weighted"
                fill="var(--accent-sage)"
                radius={[4, 4, 0, 0]}
                maxBarSize={64}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto scrollbar-thin">
        <div className="grid grid-cols-[1.4fr_1.4fr_120px_140px_100px_140px] gap-4 px-5 py-3 border-b border-border bg-secondary/30 text-[10.5px] uppercase tracking-[0.12em] font-medium text-muted-foreground min-w-[800px]">
          <div>Client</div>
          <div>Company</div>
          <div>Stage</div>
          <div className="text-right">Amount</div>
          <div className="text-right">Prob.</div>
          <div className="text-right">Weighted</div>
        </div>
        <div className="divide-y divide-border">
          {rows.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[1.4fr_1.4fr_120px_140px_100px_140px] gap-4 px-5 py-3.5 items-center text-[13px] min-w-[800px] hover:bg-secondary/40 transition-colors"
            >
              <div className="font-medium truncate">
                {r.client_name ?? "Unnamed"}
              </div>
              <div className="text-muted-foreground truncate">
                {r.client_company ?? "—"}
              </div>
              <div>
                <StageBadge stage={r.stage} />
              </div>
              <div className="text-right tabular-nums">
                {r.proposed_amount ? formatCurrency(r.proposed_amount) : "—"}
              </div>
              <div className="text-right tabular-nums text-muted-foreground">
                {(r.probability * 100).toFixed(0)}%
              </div>
              <div className="text-right tabular-nums font-medium text-[var(--accent-sage)]">
                {formatCurrency(r.weighted)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3.5 lift hover:border-muted-foreground/25">
      <div
        className={`text-[19px] sm:text-[22px] font-medium tabular-nums tracking-tight leading-none ${
          accent ? "text-[var(--accent-sage)]" : ""
        }`}
      >
        {value}
      </div>
      <div className="mt-2 text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
