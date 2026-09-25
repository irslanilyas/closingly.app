"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  EllipsisHorizontalIcon,
  LinkIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { formatCurrency } from "@/lib/format";
import { STAGE_LABELS, STAGE_ORDER, type ClientHealthLevel, type DealStage } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { DealOverview } from "@/app/api/deals/[id]/overview/route";

const STAGE_TONE: Record<DealStage, string> = {
  lead: "bg-secondary text-secondary-foreground",
  proposal_sent: "bg-brand-soft text-brand",
  negotiating: "bg-brand-soft text-brand",
  won: "bg-success/12 text-success",
  lost: "bg-destructive/10 text-destructive",
};

const HEALTH: Record<ClientHealthLevel, { label: string; tone: string }> = {
  healthy: { label: "Healthy", tone: "text-success" },
  cooling: { label: "Cooling", tone: "text-[color-mix(in_oklch,var(--warning),black_25%)] dark:text-warning" },
  at_risk: { label: "At risk", tone: "text-destructive" },
};

export function initials(text: string | null | undefined): string {
  const parts = (text ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Who, where the deal stands, and the two actions a consultant reaches for
 * without scrolling: moving the stage, and getting the proposal link.
 */
export function HubHeader({
  overview,
  onPatch,
  onEdit,
  onShare,
  sharing,
}: {
  overview: DealOverview;
  onPatch: (partial: { stage: DealStage }) => void;
  onEdit: () => void;
  onShare: () => void;
  sharing: boolean;
}) {
  const router = useRouter();
  const { deal, signals, proposal } = overview;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const name = deal.client_company || deal.client_name || "Untitled deal";
  const contact = deal.client_company && deal.client_name ? deal.client_name : null;
  const lastTouched = overview.events[0]?.created_at ?? deal.updated_at;

  const remove = async () => {
    setDeleting(true);
    const res = await fetch(`/api/deals/${deal.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setDeleting(false);
      toast.error("Couldn't delete this deal.");
      return;
    }
    toast.success("Deal deleted.");
    router.push("/pipeline");
  };

  return (
    <header className="mb-6 sm:mb-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <Link
          href="/pipeline"
          className="-my-2 inline-flex items-center gap-1.5 py-2 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" strokeWidth={1.7} />
          Pipeline
        </Link>

        <div className="flex items-center gap-2">
          {proposal && (
            <Button variant="outline" size="sm" onClick={onShare} disabled={sharing} className="gap-1.5 text-[12.5px]">
              {sharing ? <Spinner className="size-3.5" /> : <LinkIcon className="size-3.5" strokeWidth={1.8} />}
              {proposal.share_token ? "Copy proposal link" : "Share proposal"}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-sm" aria-label="Deal actions">
                <EllipsisHorizontalIcon className="size-4" strokeWidth={1.8} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={onEdit} className="gap-2 text-[13px]">
                <PencilSquareIcon className="size-4" strokeWidth={1.6} />
                Edit details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setConfirmDelete(true)}
                className="gap-2 text-[13px] text-destructive focus:text-destructive"
              >
                <TrashIcon className="size-4" strokeWidth={1.6} />
                Delete deal
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          aria-hidden
          className="grid size-7 place-items-center rounded-lg border border-border bg-card text-[10.5px] font-semibold tracking-wide text-muted-foreground"
        >
          {initials(name)}
        </span>
        {contact && <span className="text-[13px] text-muted-foreground">{contact}</span>}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-medium transition-[filter] hover:brightness-95 pointer-coarse:h-8",
                STAGE_TONE[deal.stage]
              )}
            >
              {STAGE_LABELS[deal.stage]}
              <ChevronDownIcon className="size-3" strokeWidth={2} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            {STAGE_ORDER.map((stage) => (
              <DropdownMenuItem
                key={stage}
                onSelect={() => stage !== deal.stage && onPatch({ stage })}
                className="justify-between text-[13px]"
              >
                {STAGE_LABELS[stage]}
                {stage === deal.stage && <CheckIcon className="size-4 text-brand" strokeWidth={2} />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {deal.stage !== "won" && deal.stage !== "lost" && (
          <span className="inline-flex h-6 items-center rounded-full border border-border px-2.5 text-[11.5px] tabular-nums text-muted-foreground">
            {Math.round(signals.stage_probability * 100)}% likely
          </span>
        )}

        {overview.health && (
          <span
            title={overview.health.reasons.join(". ")}
            className="inline-flex h-6 cursor-default items-center gap-1.5 rounded-full border border-border px-2.5 text-[11.5px] text-muted-foreground"
          >
            <span className={cn("size-1.5 rounded-full bg-current", HEALTH[overview.health.level].tone)} />
            {HEALTH[overview.health.level].label}
          </span>
        )}
      </div>

      <h1 className="mt-3 text-[26px] font-medium leading-tight text-balance sm:text-[30px]">
        {name}
      </h1>
      <p className="mt-1.5 text-[12.5px] text-muted-foreground">
        Last touched {formatDistanceToNow(new Date(lastTouched), { addSuffix: true })}
        {deal.proposed_amount != null && (
          <>
            {" · "}
            <span className="tabular-nums">{formatCurrency(deal.proposed_amount)}</span> potential value
          </>
        )}
      </p>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>
              Its proposal, notes and follow-ups are deleted with it. This can&rsquo;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={remove} disabled={deleting} className="gap-1.5">
              {deleting && <Spinner className="size-3.5" />}
              Delete deal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
