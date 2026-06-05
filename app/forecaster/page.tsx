"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShellClient } from "@/components/app-shell-client";
import { PageHeader } from "@/components/page-header";
import { StageBadge } from "@/components/stage-badge";
import { formatCurrency } from "@/lib/format";
import { type Deal, STAGE_PROBABILITY } from "@/lib/types";
import { addDays, isAfter, isBefore } from "date-fns";
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

const CYCLE_DAYS = 30;

export default function ForecasterPage() {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/deals")
      .then((r) => r.json())
      .then((j) => setDeals(j.deals ?? []))
      .finally(() => setLoading(false));
  }, []);

  const openDeals = useMemo(
    () => (deals ?? []).filter((d) => d.stage !== "won" && d.stage !== "lost"),
    [deals]
  );

  const totalPipeline = useMemo(
    () => openDeals.reduce((s, d) => s + (d.proposed_amount ?? 0), 0),
    [openDeals]
  );
  const weightedForecast = useMemo(
    () =>
      openDeals.reduce(
        (s, d) =>
          s + (d.proposed_amount ?? 0) * STAGE_PROBABILITY[d.stage],
        0
      ),
    [openDeals]
  );
  const avgDealSize = useMemo(() => {
    const withAmount = (deals ?? []).filter((d) => d.proposed_amount);
    if (!withAmount.length) return 0;
    return (
      withAmount.reduce((s, d) => s + (d.proposed_amount ?? 0), 0) /
      withAmount.length
    );
  }, [deals]);

  const chartData = useMemo(() => {
    const now = new Date();
    return BUCKETS.map((b) => {
      const dealsIn = openDeals.filter((d) => {
        const close = addDays(new Date(d.created_at), CYCLE_DAYS);
        const days = (close.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        return days >= b.min && days < b.max;
      });
      const weighted = dealsIn.reduce(
        (s, d) =>
          s + (d.proposed_amount ?? 0) * STAGE_PROBABILITY[d.stage],
        0
      );
      return { label: b.label, weighted, count: dealsIn.length };
    });
  }, [openDeals]);

  const rows = useMemo(
    () =>
      openDeals
        .map((d) => ({
          ...d,
          probability: STAGE_PROBABILITY[d.stage],
          weighted:
            (d.proposed_amount ?? 0) * STAGE_PROBABILITY[d.stage],
        }))
        .sort((a, b) => b.weighted - a.weighted),
    [openDeals]
  );

  return (
    <AppShellClient>
      <PageHeader
        eyebrow="Module 5 / Forecasting"
        title="Pipeline Forecaster"
        description="Weighted revenue based on stage probability. No AI — just maths."
      />

      <div className="grid grid-cols-3 gap-4 mb-10">
        <StatCard label="Total pipeline" value={formatCurrency(totalPipeline)} />
        <StatCard
          label="Weighted forecast"
          value={formatCurrency(weightedForecast)}
          accent
        />
        <StatCard label="Average deal size" value={formatCurrency(avgDealSize)} />
      </div>

      {loading ? (
        <div className="text-[13px] text-muted-foreground">Loading…</div>
      ) : (deals?.length ?? 0) === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-card/40 p-12 text-center">
          <div className="text-[13.5px] font-medium">No deals yet</div>
          <div className="mt-1.5 text-[12.5px] text-muted-foreground">
            Save some deals to your pipeline first.
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-md border border-border bg-card p-6 mb-6">
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground mb-5 font-medium">
              Weighted revenue by close window
            </div>
            <div className="h-[280px]">
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
                      borderRadius: "6px",
                      fontSize: "12px",
                    }}
                    formatter={(value, _name, item) => {
                      const v = typeof value === "number" ? value : 0;
                      const count = (item as { payload?: { count?: number } })
                        ?.payload?.count ?? 0;
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

          <div className="rounded-md border border-border bg-card overflow-hidden">
            <div className="grid grid-cols-[1.4fr_1.4fr_120px_140px_120px_140px] gap-4 px-5 py-3 border-b border-border bg-secondary/30 text-[10.5px] uppercase tracking-[0.12em] font-medium text-muted-foreground">
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
                  className="grid grid-cols-[1.4fr_1.4fr_120px_140px_120px_140px] gap-4 px-5 py-3.5 items-center text-[13px]"
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
        </>
      )}
    </AppShellClient>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-5">
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground mb-2 font-medium">
        {label}
      </div>
      <div
        className={`text-[24px] font-medium tabular-nums tracking-tight ${accent ? "text-[var(--accent-sage)]" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
