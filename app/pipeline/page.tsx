"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShellClient } from "@/components/app-shell-client";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StageBadge } from "@/components/stage-badge";
import { formatCurrency } from "@/lib/format";
import {
  type Deal,
  type DealStage,
  STAGE_LABELS,
  STAGE_ORDER,
} from "@/lib/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { formatDistanceToNowStrict } from "date-fns";
import { LayoutGrid, List, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type View = "kanban" | "list";

export default function PipelinePage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["deals"],
    queryFn: async () => {
      const r = await fetch("/api/deals");
      if (!r.ok) throw new Error("Failed to load");
      const j = (await r.json()) as { deals: Deal[] };
      return j.deals;
    },
  });

  const [view, setView] = useState<View>("kanban");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!q.trim()) return data;
    const needle = q.toLowerCase();
    return data.filter(
      (d) =>
        (d.client_name ?? "").toLowerCase().includes(needle) ||
        (d.client_company ?? "").toLowerCase().includes(needle)
    );
  }, [data, q]);

  const totals = useMemo(() => {
    const total = filtered.reduce(
      (s, d) => s + (d.proposed_amount ?? 0),
      0
    );
    return { count: filtered.length, total };
  }, [filtered]);

  const byStage = useMemo(() => {
    const map: Record<DealStage, Deal[]> = {
      lead: [],
      proposal_sent: [],
      negotiating: [],
      won: [],
      lost: [],
    };
    for (const d of filtered) {
      map[d.stage] = map[d.stage] || [];
      map[d.stage].push(d);
    }
    return map;
  }, [filtered]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const onDragEnd = async (e: DragEndEvent) => {
    const dealId = e.active.id as string;
    const dest = e.over?.id as DealStage | undefined;
    if (!dest || !STAGE_ORDER.includes(dest)) return;
    const deal = data?.find((d) => d.id === dealId);
    if (!deal || deal.stage === dest) return;

    // Optimistic
    qc.setQueryData<Deal[]>(["deals"], (prev) =>
      (prev ?? []).map((d) => (d.id === dealId ? { ...d, stage: dest } : d))
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
      toast.error("Couldn’t update stage");
      qc.invalidateQueries({ queryKey: ["deals"] });
    }
  };

  return (
    <AppShellClient>
      <PageHeader
        eyebrow="Module 2 / Pipeline"
        title="Deal Pipeline"
        description="Every saved deal. Drag between stages, drill in for the full record."
        right={
          <div className="text-right">
            <div className="text-[26px] font-medium tabular-nums tracking-tight">
              {totals.count}
              <span className="text-muted-foreground/70 mx-2 text-[15px] font-normal">
                /
              </span>
              <span className="text-[var(--accent-sage)]">
                {formatCurrency(totals.total)}
              </span>
            </div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mt-1">
              Deals / total value
            </div>
          </div>
        }
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-6">
        <div className="relative w-full sm:w-[320px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search client or company…"
            className="h-9 pl-8 text-[13px]"
          />
        </div>
        <div className="flex items-center gap-1 p-0.5 border border-border rounded-md bg-background">
          <button
            onClick={() => setView("kanban")}
            className={cn(
              "h-7 px-2.5 rounded text-[12px] inline-flex items-center gap-1.5 transition-colors",
              view === "kanban"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <LayoutGrid className="size-3.5" strokeWidth={1.5} /> Kanban
          </button>
          <button
            onClick={() => setView("list")}
            className={cn(
              "h-7 px-2.5 rounded text-[12px] inline-flex items-center gap-1.5 transition-colors",
              view === "list"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <List className="size-3.5" strokeWidth={1.5} /> List
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="text-[13px] text-muted-foreground">Loading…</div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="rounded-md border border-dashed border-border bg-card/40 p-12 text-center">
          <div className="text-[13.5px] font-medium">No deals yet</div>
          <div className="mt-1.5 text-[12.5px] text-muted-foreground">
            Generate a proposal and click <em>Save to pipeline</em>.
          </div>
          <Button
            asChild
            variant="ghost"
            className="mt-4 text-[12.5px] h-8"
          >
            <Link href="/proposal-generator">Open Proposal Generator →</Link>
          </Button>
        </div>
      )}

      {!isLoading && filtered.length > 0 && view === "kanban" && (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="overflow-x-auto -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 pb-4"><div className="grid grid-cols-5 gap-4 min-w-[900px]">
            {STAGE_ORDER.map((stage) => (
              <KanbanColumn key={stage} stage={stage} deals={byStage[stage]} />
            ))}
          </div></div>
        </DndContext>
      )}

      {!isLoading && filtered.length > 0 && view === "list" && (
        <ListView deals={filtered} />
      )}
    </AppShellClient>
  );
}

function KanbanColumn({ stage, deals }: { stage: DealStage; deals: Deal[] }) {
  const { isOver, setNodeRef } = useDroppable({ id: stage });
  const sum = deals.reduce((s, d) => s + (d.proposed_amount ?? 0), 0);
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-md border border-border bg-card/40 p-3 min-h-[400px] transition-colors",
        isOver && "border-[var(--accent-sage)]/60 bg-[var(--accent-sage)]/5"
      )}
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="text-[11px] uppercase tracking-[0.14em] font-medium">
          {STAGE_LABELS[stage]}
        </div>
        <div className="text-[10.5px] text-muted-foreground tabular-nums">
          {deals.length} · {formatCurrency(sum)}
        </div>
      </div>
      <div className="space-y-2">
        {deals.length === 0 ? (
          <div className="text-[11.5px] text-muted-foreground/70 px-1 py-6 text-center">
            No deals
          </div>
        ) : (
          deals.map((d) => <DealChip key={d.id} deal={d} />)
        )}
      </div>
    </div>
  );
}

function DealChip({ deal }: { deal: Deal }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: deal.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "rounded-md border border-border bg-card p-3 cursor-grab active:cursor-grabbing select-none transition-shadow",
        isDragging && "opacity-50 shadow-lg"
      )}
    >
      <Link href={`/pipeline/${deal.id}`} onClick={(e) => e.stopPropagation()}>
        <div className="text-[13px] font-medium tracking-tight truncate">
          {deal.client_name ?? "Unnamed"}
        </div>
        <div className="text-[11.5px] text-muted-foreground truncate mt-0.5">
          {deal.client_company ?? "—"}
        </div>
        <div className="mt-2.5 flex items-center justify-between">
          <span className="text-[12px] font-medium tabular-nums text-[var(--accent-sage)]">
            {deal.proposed_amount
              ? formatCurrency(deal.proposed_amount)
              : "—"}
          </span>
          <span className="text-[10.5px] text-muted-foreground tabular-nums">
            {formatDistanceToNowStrict(new Date(deal.created_at), {
              addSuffix: true,
            })}
          </span>
        </div>
      </Link>
    </div>
  );
}

function ListView({ deals }: { deals: Deal[] }) {
  const [sortKey, setSortKey] = useState<keyof Deal>("created_at");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    return [...deals].sort((a, b) => {
      const x = a[sortKey];
      const y = b[sortKey];
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      if (typeof x === "number" && typeof y === "number")
        return dir === "asc" ? x - y : y - x;
      return dir === "asc"
        ? String(x).localeCompare(String(y))
        : String(y).localeCompare(String(x));
    });
  }, [deals, sortKey, dir]);

  const Header = ({
    label,
    k,
    className,
  }: {
    label: string;
    k: keyof Deal;
    className?: string;
  }) => (
    <button
      onClick={() => {
        if (sortKey === k) setDir(dir === "asc" ? "desc" : "asc");
        else {
          setSortKey(k);
          setDir("asc");
        }
      }}
      className={cn(
        "text-[10.5px] uppercase tracking-[0.12em] font-medium text-muted-foreground hover:text-foreground transition-colors text-left",
        className
      )}
    >
      {label}
      {sortKey === k && <span className="ml-1">{dir === "asc" ? "↑" : "↓"}</span>}
    </button>
  );

  return (
    <div className="rounded-md border border-border bg-card overflow-x-auto">
      <div className="grid grid-cols-[1.4fr_1.4fr_120px_140px_140px_140px] gap-4 px-5 py-3 border-b border-border bg-secondary/30 min-w-[800px]">
        <Header label="Client" k="client_name" />
        <Header label="Company" k="client_company" />
        <Header label="Stage" k="stage" />
        <Header label="Amount" k="proposed_amount" className="text-right justify-self-end" />
        <Header label="Created" k="created_at" />
        <Header label="Updated" k="updated_at" />
      </div>
      <div className="divide-y divide-border">
        {sorted.map((d) => (
          <Link
            key={d.id}
            href={`/pipeline/${d.id}`}
            className="grid grid-cols-[1.4fr_1.4fr_120px_140px_140px_140px] gap-4 px-5 py-3.5 items-center hover:bg-secondary/40 transition-colors min-w-[800px]"
          >
            <div className="text-[13px] font-medium truncate">
              {d.client_name ?? "Unnamed"}
            </div>
            <div className="text-[12.5px] text-muted-foreground truncate">
              {d.client_company ?? "—"}
            </div>
            <div>
              <StageBadge stage={d.stage} />
            </div>
            <div className="text-[13px] tabular-nums text-right">
              {d.proposed_amount ? formatCurrency(d.proposed_amount) : "—"}
            </div>
            <div className="text-[12px] text-muted-foreground tabular-nums">
              {formatDistanceToNowStrict(new Date(d.created_at), {
                addSuffix: true,
              })}
            </div>
            <div className="text-[12px] text-muted-foreground tabular-nums">
              {formatDistanceToNowStrict(new Date(d.updated_at), {
                addSuffix: true,
              })}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
