"use client";

import { useState } from "react";
import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { STAGE_LABELS, STAGE_ORDER, type DealStage } from "@/lib/types";
import type { PipelineDeal, EngagementLevel } from "@/app/api/pipeline/route";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  Eye,
  EyeOff,
  FileX2,
  Flame,
  ArrowRight,
  Send,
  GripVertical,
  Check,
} from "lucide-react";

/**
 * A deal, as a thing you act on.
 *
 * The old card showed a name and an amount, which the person already knew. The
 * three things that actually decide what to do next are: has the client opened
 * the proposal, how long has this been sitting, and what do the rules say. All
 * three are on the card, and every action is reachable without opening it.
 */

const ENGAGEMENT: Record<
  EngagementLevel,
  { label: string; Icon: typeof Eye; tone: "brand" | "warn" | "muted" }
> = {
  no_proposal: { label: "No proposal yet", Icon: FileX2, tone: "muted" },
  unsent: { label: "Drafted, not sent", Icon: FileX2, tone: "warn" },
  unopened: { label: "Sent, never opened", Icon: EyeOff, tone: "warn" },
  opened: { label: "Opened", Icon: Eye, tone: "brand" },
  engaged: { label: "Reading it repeatedly", Icon: Flame, tone: "brand" },
};

export function DealCard({
  deal,
  onStage,
  onChase,
  draggable = true,
}: {
  deal: PipelineDeal;
  onStage: (stage: DealStage) => void;
  onChase: () => void;
  draggable?: boolean;
}) {
  const [chasing, setChasing] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: deal.id, disabled: !draggable });

  const name =
    deal.client_company?.trim() || deal.client_name?.trim() || "Untitled deal";
  const engagement = ENGAGEMENT[deal.engagement];
  const closed = deal.stage === "won" || deal.stage === "lost";

  const chase = async () => {
    setChasing(true);
    try {
      await onChase();
    } finally {
      setChasing(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
      className={cn(
        "panel group/card relative p-3",
        isDragging && "opacity-40",
        deal.next_action?.priority === 1 && "border-brand/45"
      )}
    >
      <div className="flex items-start gap-2">
        {draggable && (
          <button
            type="button"
            aria-label="Drag to another stage"
            className="-ml-1 mt-px hidden shrink-0 cursor-grab text-muted-foreground/40 transition-opacity active:cursor-grabbing pointer-fine:block pointer-fine:opacity-0 pointer-fine:group-hover/card:opacity-100"
            {...listeners}
            {...attributes}
          >
            <GripVertical className="size-3.5" strokeWidth={1.6} />
          </button>
        )}

        <Link href={`/pipeline/${deal.id}`} className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium leading-snug tracking-tight hover:text-brand">
            {name}
          </div>
          <div className="mt-0.5 flex items-baseline gap-2">
            {deal.proposed_amount != null && (
              <span className="text-[13px] tabular-nums">
                {formatCurrency(deal.proposed_amount)}
              </span>
            )}
            <span className="text-[11.5px] text-muted-foreground tabular-nums">
              {deal.days_in_stage === 0
                ? "today"
                : `${deal.days_in_stage}d in stage`}
            </span>
          </div>
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Actions for ${name}`}
              className="-mr-1.5 -mt-1.5 shrink-0 rounded-md p-2 text-muted-foreground transition-opacity hover:bg-secondary hover:text-foreground pointer-fine:-mr-1 pointer-fine:-mt-1 pointer-fine:p-1 pointer-fine:opacity-0 pointer-fine:group-hover/card:opacity-100 pointer-fine:focus-visible:opacity-100 pointer-fine:aria-expanded:opacity-100"
            >
              <MoreHorizontal className="size-3.5" strokeWidth={1.8} />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="min-w-[11rem]">
            <DropdownMenuLabel className="text-[11.5px] text-muted-foreground">
              Move to
            </DropdownMenuLabel>
            {STAGE_ORDER.map((stage) => (
              <DropdownMenuItem
                key={stage}
                onSelect={() => stage !== deal.stage && onStage(stage)}
                className={cn(stage === deal.stage && "text-muted-foreground")}
              >
                {stage === deal.stage ? (
                  <Check strokeWidth={2.2} />
                ) : (
                  <span className="size-3.5" />
                )}
                {STAGE_LABELS[stage]}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={`/pipeline/${deal.id}`}>
                <ArrowRight strokeWidth={1.7} />
                Open deal
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <engagement.Icon
          className={cn(
            "size-3 shrink-0",
            engagement.tone === "brand" && "text-brand",
            engagement.tone === "warn" && "text-warning",
            engagement.tone === "muted" && "text-muted-foreground"
          )}
          strokeWidth={1.8}
        />
        <span className="text-[11.5px] text-muted-foreground">
          {engagement.label}
          {deal.view_count > 1 ? ` · ${deal.view_count} times` : ""}
        </span>
      </div>

      {deal.next_action && !closed && (
        <div className="mt-2.5 border-t border-border pt-2.5">
          <p className="line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground">
            {deal.next_action.reason}
          </p>
          {deal.queued ? (
            <Link
              href="/follow-ups"
              className="mt-1.5 inline-flex items-center gap-1 py-1 text-[11.5px] text-brand hover:underline"
            >
              Waiting in follow-ups
              <ArrowRight className="size-3" strokeWidth={1.8} />
            </Link>
          ) : (
            <button
              type="button"
              onClick={chase}
              disabled={chasing}
              className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 pointer-coarse:px-3 pointer-coarse:py-2 text-[11.5px] transition-colors hover:border-brand/50 hover:text-brand disabled:opacity-60"
            >
              <Send className="size-3" strokeWidth={1.8} />
              {chasing ? "Adding…" : "Write the follow-up"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
