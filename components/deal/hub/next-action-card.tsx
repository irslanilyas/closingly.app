"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  BoltIcon,
  CheckIcon,
  ClockIcon,
  PencilSquareIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import type { FollowUpKind } from "@/lib/follow-ups/rules";
import type { DealOverview } from "@/app/api/deals/[id]/overview/route";
import { HubCard, ToolSheet } from "./primitives";
import { FollowUpComposer } from "./follow-up-composer";

const HEADLINE: Record<FollowUpKind, string> = {
  proposal_chase: "Follow up while the proposal is fresh.",
  nudge: "Nudge it forward before it cools.",
  unanswered_question: "Answer what they asked.",
  check_in: "Check in, lightly.",
  scope_risk: "Guard the scope before it grows.",
  custom: "Your follow-up is waiting.",
};

const SNOOZES = [
  { key: "tomorrow", label: "Tomorrow" },
  { key: "three_days", label: "In 3 days" },
  { key: "next_week", label: "Next week" },
  { key: "two_weeks", label: "In 2 weeks" },
] as const;

async function post(url: string, body?: unknown) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
}

/**
 * The one thing to do about this deal now, already half done.
 *
 * When the rules have raised something, the draft is usually written before
 * the consultant opens the page; the card shows its opening lines so the
 * decision is "send this" or "change this", not "what should I say".
 */
export function NextActionCard({
  overview,
  refresh,
  onWrapUp,
}: {
  overview: DealOverview;
  refresh: () => Promise<unknown>;
  onWrapUp: () => void;
}) {
  const { deal, follow_up: followUp, signals } = overview;
  const [composing, setComposing] = useState(false);
  // Each opening of the sheet is a fresh composer. Within one opening it stays
  // mounted, so a draft that lands while it is open plays in rather than
  // appearing already there.
  const [session, setSession] = useState(0);
  const open = () => {
    setSession((n) => n + 1);
    setComposing(true);
  };
  const [drafting, setDrafting] = useState(false);
  const [busy, setBusy] = useState(false);

  const closed = deal.stage === "won" || deal.stage === "lost";
  const suggested = signals.next_action;

  /** Raise the suggestion if needed, write the draft, and open it. */
  const draft = async () => {
    open();
    setDrafting(true);

    let id = followUp?.id;
    if (!id && suggested) {
      const res = await post("/api/follow-ups", {
        deal_id: deal.id,
        kind: suggested.kind,
        reason: suggested.reason,
        priority: suggested.priority,
      });
      id = res?.ok ? ((await res.json()) as { id: string }).id : undefined;
    }
    if (!id) {
      setDrafting(false);
      setComposing(false);
      toast.error("Couldn't start that follow-up.");
      return;
    }

    const res = await post(`/api/follow-ups/${id}/draft`, {});
    if (!res?.ok) {
      toast.error(
        res?.status === 429 ? "That's a lot of drafts this hour. Try again shortly." : "Couldn't write the draft. Try again."
      );
    }
    await refresh();
    setDrafting(false);
  };

  const update = async (body: Record<string, string>, success: string) => {
    if (!followUp) return;
    setBusy(true);
    const res = await fetch(`/api/follow-ups/${followUp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res?.ok) {
      setBusy(false);
      toast.error("Couldn't update that.");
      return;
    }
    await refresh();
    setBusy(false);
    toast.success(success);
  };

  const finish = async () => {
    setComposing(false);
    await refresh();
  };

  if (closed) {
    const won = deal.stage === "won";
    return (
      <HubCard
        eyebrow="Next best action"
        icon={BoltIcon}
        title={won ? "Capture what won it, while you remember." : "Write down why, so the next one goes better."}
      >
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          {won
            ? "A two-minute wrap-up becomes a case study you can send to the next prospect."
            : "Lost deals teach the most, but only if the reason is written down the same week."}
        </p>
        <Button variant="outline" size="sm" onClick={onWrapUp} className="mt-4 gap-1.5">
          <PencilSquareIcon className="size-3.5" strokeWidth={1.8} />
          {won ? "Write the wrap-up" : "Write the post-mortem"}
        </Button>
      </HubCard>
    );
  }

  const kind = (followUp?.kind ?? suggested?.kind) as FollowUpKind | undefined;
  const reason = followUp?.reason ?? suggested?.reason;

  if (!kind || !reason) {
    return (
      <HubCard eyebrow="Next best action" icon={BoltIcon} title="Nothing needs you here right now.">
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          Closingly watches the proposal and the calendar, and raises a follow-up the moment one is due.
        </p>
      </HubCard>
    );
  }

  const hasDraft = !!followUp?.draft_body;

  return (
    <HubCard
      eyebrow="Next best action"
      icon={BoltIcon}
      tone="accent"
      title={HEADLINE[kind]}
      action={
        followUp && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Snooze" disabled={busy}>
                <ClockIcon className="size-4" strokeWidth={1.7} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {SNOOZES.map((s) => (
                <DropdownMenuItem
                  key={s.key}
                  className="text-[13px]"
                  onSelect={() => update({ action: "snooze", snooze: s.key }, `Snoozed until ${s.label.toLowerCase()}.`)}
                >
                  {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      }
    >
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{reason}</p>

      {hasDraft && (
        <button
          type="button"
          onClick={open}
          className="mt-4 block w-full rounded-lg border border-border bg-card px-3.5 py-3 text-left transition-colors hover:border-brand/40"
        >
          {followUp?.draft_subject && (
            <div className="truncate text-[12.5px] font-medium">{followUp.draft_subject}</div>
          )}
          <p className="mt-1 line-clamp-3 text-[12.5px] leading-relaxed text-muted-foreground">
            {followUp?.draft_body?.replace(/\s+/g, " ")}
          </p>
        </button>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {hasDraft ? (
          <Button variant="brand" size="sm" onClick={open} className="gap-1.5">
            <PencilSquareIcon className="size-3.5" strokeWidth={1.8} />
            Review follow-up draft
          </Button>
        ) : (
          <Button variant="brand" size="sm" onClick={draft} disabled={drafting} className="gap-1.5">
            {drafting ? <Spinner className="size-3.5" /> : <SparklesIcon className="size-3.5" strokeWidth={1.8} />}
            Write the follow-up
          </Button>
        )}
        {followUp && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => update({ action: "done" }, "Marked as done.")}
            className="gap-1.5 text-muted-foreground"
          >
            <CheckIcon className="size-3.5" strokeWidth={2} />
            Mark as done
          </Button>
        )}
      </div>

      <ToolSheet
        open={composing}
        onOpenChange={setComposing}
        title={HEADLINE[kind].replace(/\.$/, "")}
        description="Written from the call and the proposal. Change anything; it saves as you go."
      >
        <FollowUpComposer
          key={session}
          followUp={followUp}
          drafting={drafting}
          clientEmail={deal.client_email ?? null}
          onDone={finish}
        />
      </ToolSheet>
    </HubCard>
  );
}
