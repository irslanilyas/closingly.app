"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { AppShellClient } from "@/components/app-shell-client";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DealCard } from "@/components/pipeline/deal-card";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  STAGE_LABELS,
  STAGE_ORDER,
  STAGE_PROBABILITY,
  type DealStage,
} from "@/lib/types";
import type { PipelineDeal } from "@/app/api/pipeline/route";
import { Search, Columns3, Rows3, Inbox, AlertCircle } from "lucide-react";

type View = "board" | "list";

/** Open stages only. Won and lost are outcomes, not work in progress. */
const OPEN_STAGES: DealStage[] = ["lead", "proposal_sent", "negotiating"];

export function PipelineView() {
  const qc = useQueryClient();
  const [view, setView] = useState<View>("board");
  const [q, setQ] = useState("");
  const [needsAction, setNeedsAction] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["pipeline"],
    queryFn: async () => {
      const r = await fetch("/api/pipeline");
      if (!r.ok) throw new Error("Failed to load");
      const j = (await r.json()) as { deals: PipelineDeal[] };
      return j.deals;
    },
  });

  const filtered = useMemo(() => {
    let rows = data ?? [];

    if (needsAction) rows = rows.filter((d) => d.next_action != null);

    const needle = q.trim().toLowerCase();
    if (needle) {
      rows = rows.filter(
        (d) =>
          (d.client_name ?? "").toLowerCase().includes(needle) ||
          (d.client_company ?? "").toLowerCase().includes(needle) ||
          (d.pain_point ?? "").toLowerCase().includes(needle)
      );
    }

    return rows;
  }, [data, q, needsAction]);

  const stats = useMemo(() => {
    const open = filtered.filter((d) => OPEN_STAGES.includes(d.stage));
    const value = open.reduce((s, d) => s + (d.proposed_amount ?? 0), 0);
    const weighted = open.reduce(
      (s, d) => s + (d.proposed_amount ?? 0) * STAGE_PROBABILITY[d.stage],
      0
    );
    const attention = filtered.filter(
      (d) => d.next_action?.priority === 1
    ).length;
    return { count: open.length, value, weighted: Math.round(weighted), attention };
  }, [filtered]);

  const byStage = useMemo(() => {
    const map = {} as Record<DealStage, PipelineDeal[]>;
    for (const stage of STAGE_ORDER) map[stage] = [];
    for (const d of filtered) map[d.stage]?.push(d);

    // Most urgent first inside every column, so the top of a stack is always
    // the deal worth looking at.
    for (const stage of STAGE_ORDER) {
      map[stage].sort((a, b) => {
        const pa = a.next_action?.priority ?? 9;
        const pb = b.next_action?.priority ?? 9;
        if (pa !== pb) return pa - pb;
        return (b.proposed_amount ?? 0) - (a.proposed_amount ?? 0);
      });
    }
    return map;
  }, [filtered]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const setStage = async (dealId: string, dest: DealStage) => {
    const deal = data?.find((d) => d.id === dealId);
    if (!deal || deal.stage === dest) return;

    qc.setQueryData<PipelineDeal[]>(["pipeline"], (prev) =>
      (prev ?? []).map((d) =>
        d.id === dealId ? { ...d, stage: dest, days_in_stage: 0 } : d
      )
    );

    try {
      const r = await fetch(`/api/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: dest }),
      });
      if (!r.ok) throw new Error();
      toast.success(`Moved to ${STAGE_LABELS[dest]}`);
    } catch {
      toast.error("Couldn't update the stage.");
      qc.invalidateQueries({ queryKey: ["pipeline"] });
    }
  };

  /**
   * Puts the deal in the follow-up queue with the reason the rules gave, so
   * the message gets drafted and the work leaves the board. The board is for
   * deciding; the queue is for writing.
   */
  const chase = async (deal: PipelineDeal) => {
    if (!deal.next_action) return;

    qc.setQueryData<PipelineDeal[]>(["pipeline"], (prev) =>
      (prev ?? []).map((d) => (d.id === deal.id ? { ...d, queued: true } : d))
    );

    try {
      const r = await fetch("/api/follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_id: deal.id,
          reason: deal.next_action.reason,
          priority: deal.next_action.priority,
        }),
      });
      if (!r.ok) throw new Error();

      const { id } = (await r.json()) as { id: string };
      // Drafted immediately rather than on open: the point of sending it to
      // the queue is that the writing is already done when you get there.
      fetch(`/api/follow-ups/${id}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).catch(() => {});

      toast.success("Added to follow-ups. The message is being written.");
    } catch {
      toast.error("Couldn't add that.");
      qc.invalidateQueries({ queryKey: ["pipeline"] });
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    const dest = e.over?.id as DealStage | undefined;
    if (!dest || !STAGE_ORDER.includes(dest)) return;
    setStage(e.active.id as string, dest);
  };

  return (
    <>
      <PageHeader
        title="Every deal in play"
        description="Sorted by what needs you, not by when it was created. Move a deal, or send it straight to follow-ups with the message written."
        right={
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            {(
              [
                { value: "board", Icon: Columns3, label: "Board" },
                { value: "list", Icon: Rows3, label: "List" },
              ] as const
            ).map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => setView(v.value)}
                aria-label={v.label}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1.5 pointer-coarse:px-3.5 pointer-coarse:py-2 text-[12.5px] transition-colors",
                  view === v.value
                    ? "bg-secondary font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <v.Icon className="size-3.5" strokeWidth={1.7} />
                {v.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
        <Stat label="Open deals" value={String(stats.count)} />
        <Stat label="In play" value={formatCurrency(stats.value)} />
        <Stat
          label="Weighted"
          value={formatCurrency(stats.weighted)}
          hint="By stage probability"
        />
        <Stat
          label="Need you today"
          value={String(stats.attention)}
          accent={stats.attention > 0}
        />
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[170px] flex-1 sm:max-w-[320px]">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.7}
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by client or what they need"
            className="h-9 pl-8 text-[13px] pointer-coarse:h-10"
          />
        </div>

        <button
          type="button"
          onClick={() => setNeedsAction((v) => !v)}
          className={cn(
            "inline-flex h-9 pointer-coarse:h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] transition-colors",
            needsAction
              ? "border-brand bg-brand-soft/60 text-foreground"
              : "border-border bg-card text-muted-foreground hover:text-foreground"
          )}
        >
          <AlertCircle className="size-3.5" strokeWidth={1.7} />
          Needs action
        </button>
      </div>

      {isLoading ? (
        <BoardSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyPipeline filtered={!!q.trim() || needsAction} />
      ) : view === "board" ? (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="board-scroll -mx-4 snap-x snap-mandatory scroll-px-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:-mx-8 lg:snap-none lg:px-8 lg:pb-3">
            <div className="flex min-w-max gap-3">
              {STAGE_ORDER.map((stage) => (
                <Column
                  key={stage}
                  stage={stage}
                  deals={byStage[stage]}
                  onStage={setStage}
                  onChase={chase}
                />
              ))}
            </div>
          </div>
        </DndContext>
      ) : (
        <ListView deals={filtered} onStage={setStage} onChase={chase} />
      )}
    </>
  );
}

export default function PipelinePage() {
  return (
    <AppShellClient>
      <PipelineView />
    </AppShellClient>
  );
}

/* ── Board ─────────────────────────────────────────────────────────────── */

function Column({
  stage,
  deals,
  onStage,
  onChase,
}: {
  stage: DealStage;
  deals: PipelineDeal[];
  onStage: (id: string, stage: DealStage) => void;
  onChase: (deal: PipelineDeal) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const value = deals.reduce((s, d) => s + (d.proposed_amount ?? 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-[min(288px,calc(100vw-56px))] shrink-0 snap-start flex-col rounded-xl border p-2.5 transition-colors",
        isOver
          ? "border-brand bg-brand-soft/40"
          : "border-border bg-secondary/40"
      )}
    >
      <div className="mb-2.5 flex items-baseline justify-between gap-2 px-1">
        <span className="text-[12.5px] font-medium tracking-tight">
          {STAGE_LABELS[stage]}
          <span className="ml-1.5 text-[11.5px] font-normal text-muted-foreground tabular-nums">
            {deals.length}
          </span>
        </span>
        {value > 0 && (
          <span className="text-[11.5px] text-muted-foreground tabular-nums">
            {formatCurrency(value)}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {deals.length === 0 ? (
          <div className="stock-grain rounded-lg py-8" aria-hidden />
        ) : (
          deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              onStage={(next) => onStage(deal.id, next)}
              onChase={() => onChase(deal)}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ── List ──────────────────────────────────────────────────────────────── */

function ListView({
  deals,
  onStage,
  onChase,
}: {
  deals: PipelineDeal[];
  onStage: (id: string, stage: DealStage) => void;
  onChase: (deal: PipelineDeal) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {deals.map((deal) => (
        <DealCard
          key={deal.id}
          deal={deal}
          draggable={false}
          onStage={(next) => onStage(deal.id, next)}
          onChase={() => onChase(deal)}
        />
      ))}
    </div>
  );
}

/* ── Bits ──────────────────────────────────────────────────────────────── */

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
    <div className="panel min-w-0 p-3 sm:p-3.5">
      <div className="label truncate">{label}</div>
      <div
        className={cn(
          "mt-1.5 text-[19px] sm:text-[22px] leading-none tabular-nums tracking-tight",
          accent && "text-brand"
        )}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-1 hidden text-[11px] text-muted-foreground sm:block">{hint}</div>
      )}
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="w-[min(288px,calc(100vw-56px))] shrink-0 space-y-2">
          <Skeleton className="h-5 w-28 rounded" />
          <Skeleton className="h-[104px] w-full rounded-xl" />
          <Skeleton className="h-[104px] w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

function EmptyPipeline({ filtered }: { filtered: boolean }) {
  return (
    <div className="panel px-6 py-12 text-center">
      <span className="mx-auto grid size-10 place-items-center rounded-full bg-secondary">
        <Inbox className="size-4 text-muted-foreground" strokeWidth={1.6} />
      </span>
      <p className="mt-4 text-[14px] font-medium tracking-tight">
        {filtered ? "Nothing matches that" : "No deals yet"}
      </p>
      <p className="mx-auto mt-1.5 max-w-[46ch] text-[12.5px] leading-relaxed text-muted-foreground">
        {filtered
          ? "Clear the filter to see the whole pipeline."
          : "Switch the notetaker on for a client call, or paste a transcript from one that already happened. A deal shows up here with the proposal already drafted."}
      </p>
      {!filtered && (
        <Link
          href="/meetings"
          className="mt-4 inline-flex items-center gap-1 text-[12.5px] text-brand hover:underline"
        >
          Go to your calls
        </Link>
      )}
    </div>
  );
}
