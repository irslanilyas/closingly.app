"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PricingPanel } from "@/components/deal/pricing-panel";
import { ScopePanel } from "@/components/deal/scope-panel";
import { TranscriptPlayer } from "@/components/deal/transcript-player";
import { PostmortemPanel } from "@/components/deal/postmortem-panel";
import { CaseStudyPanel } from "@/components/deal/case-study-panel";
import { DealNotes } from "@/components/deal/notes";
import { formatCurrency } from "@/lib/format";
import { useDealOverview } from "./use-deal-overview";
import { HubHeader } from "./hub-header";
import { StatStrip } from "./stat-strip";
import { ActionCanvas, type HubTool } from "./action-canvas";
import { NextActionCard } from "./next-action-card";
import { TrackingCard } from "./tracking-card";
import { ScopeCard } from "./scope-card";
import { TranscriptCard } from "./transcript-card";
import { DetailsCard, DealDetailsForm } from "./details-card";
import { Reveal, ToolSheet } from "./primitives";

const TOOL_COPY: Record<HubTool, { title: string; description: string }> = {
  transcript: { title: "Call transcript", description: "Everything that was said, with the recording where there is one." },
  scope: { title: "Check a new request", description: "Paste what they asked for. It is checked against what was agreed." },
  pricing: { title: "What to charge", description: "A range worked out from the call, the scope and the budget signal." },
  edit: { title: "Deal details", description: "Everything here feeds the proposal and the follow-ups." },
  wrapup: { title: "Wrap-up", description: "Written from the deal's history. Edit before you use it." },
};

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * One deal, and everything that can be done about it, on one page.
 *
 * Read top to bottom it answers: who is this, where does it stand, what do I
 * do next, and what has happened. Every tool that used to be its own tab opens
 * in a sheet over the page instead, so doing the work never loses the context.
 */
export function DealHub({ dealId }: { dealId: string }) {
  const { overview, loading, notFound, failed, refresh, patchDeal } = useDealOverview(dealId);
  const [tool, setTool] = useState<HubTool | null>(null);
  const [sharing, setSharing] = useState(false);

  if (loading) return <HubSkeleton />;

  // A failed background refresh keeps the page it already has; only a page
  // with nothing to show becomes an error.
  if (!overview) {
    return (
      <div className="py-24 text-center">
        <div className="text-[15px] font-medium">
          {notFound ? "This deal doesn't exist, or isn't yours." : "Couldn't load this deal."}
        </div>
        <div className="mt-4 flex justify-center gap-2">
          {failed && (
            <Button variant="outline" size="sm" onClick={() => refresh()}>
              Try again
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild>
            <Link href="/pipeline">Back to pipeline</Link>
          </Button>
        </div>
      </div>
    );
  }

  const { deal, proposal } = overview;

  const share = async () => {
    if (!proposal) return;
    const origin = window.location.origin;
    if (proposal.share_token) {
      const link = `${origin}/p/${proposal.share_token}`;
      toast.success((await copy(link)) ? "Link copied." : link);
      return;
    }
    setSharing(true);
    const res = await fetch(`/api/proposals/${proposal.id}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => null);
    setSharing(false);
    if (!res?.ok) {
      toast.error("Couldn't create the link.");
      return;
    }
    const { token } = (await res.json()) as { token: string };
    const link = `${origin}/p/${token}`;
    toast.success((await copy(link)) ? "Shared. The link is on your clipboard." : `Shared: ${link}`, {
      description: "You'll see here when they open it.",
    });
    refresh();
  };

  const applyPrice = async (amount: number) => {
    if (await patchDeal({ proposed_amount: amount })) {
      toast.success(`Deal value set to ${formatCurrency(amount)}.`);
      setTool(null);
    }
  };

  const wrapTitle = deal.stage === "won" ? "Case study" : "Post-mortem";

  return (
    <div className="mx-auto max-w-[1120px]">
      <HubHeader
        overview={overview}
        onPatch={patchDeal}
        onEdit={() => setTool("edit")}
        onShare={share}
        sharing={sharing}
      />

      <StatStrip overview={overview} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-5">
        <Reveal index={4} className="min-w-0">
          <ActionCanvas overview={overview} openTool={setTool} onShare={share} onRefined={refresh} />
        </Reveal>
        <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
          <Reveal index={5}>
            <NextActionCard overview={overview} refresh={refresh} onWrapUp={() => setTool("wrapup")} />
          </Reveal>
          <Reveal index={6}>
            <TrackingCard overview={overview} />
          </Reveal>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:mt-5 lg:grid-cols-2 lg:gap-5">
        <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
          <Reveal index={7}>
            <TranscriptCard overview={overview} onOpen={() => setTool("transcript")} />
          </Reveal>
          <Reveal index={8}>
            <DealNotes dealId={deal.id} legacyNote={deal.notes} onChange={refresh} />
          </Reveal>
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
          <Reveal index={7}>
            <ScopeCard overview={overview} onCheck={() => setTool("scope")} />
          </Reveal>
          <Reveal index={8}>
            <DetailsCard deal={deal} onEdit={() => setTool("edit")} />
          </Reveal>
        </div>
      </div>

      <ToolSheet
        open={tool !== null}
        onOpenChange={(open) => !open && setTool(null)}
        title={tool === "wrapup" ? wrapTitle : tool ? TOOL_COPY[tool].title : ""}
        description={tool ? TOOL_COPY[tool].description : undefined}
      >
        {tool === "transcript" && <TranscriptPlayer dealId={deal.id} fallbackTranscript={deal.transcript} />}
        {tool === "scope" && <ScopePanel proposal={proposal?.data ?? null} />}
        {tool === "pricing" && <PricingPanel deal={deal} onApply={applyPrice} />}
        {tool === "edit" && <DealDetailsForm deal={deal} onPatch={patchDeal} />}
        {tool === "wrapup" &&
          (deal.stage === "won" ? (
            <CaseStudyPanel dealId={deal.id} />
          ) : deal.stage === "lost" ? (
            <PostmortemPanel dealId={deal.id} />
          ) : (
            <p className="text-[13px] text-muted-foreground">Wrap-ups open once a deal is won or lost.</p>
          ))}
      </ToolSheet>
    </div>
  );
}

function HubSkeleton() {
  return (
    <div className="mx-auto max-w-[1120px]" aria-busy>
      <Skeleton className="mb-5 h-4 w-20" />
      <Skeleton className="h-6 w-56" />
      <Skeleton className="mt-3 h-9 w-72" />
      <Skeleton className="mt-2 h-4 w-60" />
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-xl" />
        ))}
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Skeleton className="h-[440px] rounded-xl" />
        <div className="space-y-5">
          <Skeleton className="h-[210px] rounded-xl" />
          <Skeleton className="h-[210px] rounded-xl" />
        </div>
      </div>
    </div>
  );
}
