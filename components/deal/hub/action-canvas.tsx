"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import {
  ArrowUpIcon,
  CheckIcon,
  DocumentTextIcon,
  EyeIcon,
  LinkIcon,
  PencilSquareIcon,
  SparklesIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { DealOverview } from "@/app/api/deals/[id]/overview/route";
import { HubCard } from "./primitives";
import { PROPOSAL_SECTIONS, sectionPreview, type ProposalSectionKey } from "./proposal-sections";

export type HubTool = "transcript" | "scope" | "pricing" | "edit" | "wrapup";

/** Which document section a refined proposal field belongs to. */
const FIELD_TO_SECTION: Record<string, ProposalSectionKey> = {
  challenge: "the_challenge",
  approach: "approach",
  deliverables: "what_you_get",
  timeline_phased: "timeline",
  investment_number: "investment",
  investment_terms: "investment",
  next_steps: "next_steps",
};

function headline(overview: DealOverview): string {
  const { deal, proposal } = overview;
  if (deal.stage === "won") return "Won. Worth turning into a case study.";
  if (deal.stage === "lost") return "Lost. Worth knowing why.";
  if (!proposal) return "No proposal yet";
  if (!proposal.shared_at) return "Proposal is ready for review";
  if (!proposal.tracking.total_views) return "Sent, not opened yet";
  const read = proposal.tracking.sections_viewed.length;
  return `They've read ${read} of ${PROPOSAL_SECTIONS.length} sections`;
}

/**
 * Where the deal's work happens.
 *
 * The stepper is the order a proposal actually gets built in: understand the
 * client, fence the scope, price it, write it. Each step opens the tool for
 * that step, so the page is somewhere you work rather than a list of links
 * to other pages.
 */
export function ActionCanvas({
  overview,
  openTool,
  onShare,
  onRefined,
}: {
  overview: DealOverview;
  openTool: (tool: HubTool) => void;
  onShare: () => void;
  onRefined: () => void;
}) {
  const router = useRouter();
  const { deal, proposal, meeting } = overview;

  const steps: Array<{ key: string; label: string; done: boolean; onClick: () => void }> = [
    {
      key: "context",
      label: "Context",
      done: !!meeting || !!deal.pain_point,
      onClick: () => openTool(meeting ? "transcript" : "edit"),
    },
    {
      key: "scope",
      label: "Scope",
      done: !!proposal?.data.deliverables.length,
      onClick: () => openTool("scope"),
    },
    {
      key: "pricing",
      label: "Pricing",
      done: deal.proposed_amount != null,
      onClick: () => openTool("pricing"),
    },
    {
      key: "proposal",
      label: proposal?.shared_at ? "Sent" : "Proposal",
      done: !!proposal?.shared_at,
      onClick: () => proposal && router.push(`/proposals/${proposal.id}`),
    },
  ];
  const current = steps.findIndex((s) => !s.done);

  const subtitle = proposal
    ? `Long-form client document · ${PROPOSAL_SECTIONS.length} sections · ${proposal.shared_at ? "Sent" : "Draft"} v${proposal.versions}`
    : "Drafted automatically from a recorded or imported call";

  return (
    <HubCard
      eyebrow="Action canvas"
      icon={DocumentTextIcon}
      title={headline(overview)}
      action={
        proposal && (
          <span className="inline-flex h-6 items-center rounded-full bg-brand-soft px-2.5 text-[11px] font-medium text-brand">
            {proposal.shared_at ? "Sent" : "Draft"} v{proposal.versions}
          </span>
        )
      }
    >
      <p className="mt-1 text-[12px] text-muted-foreground">{subtitle}</p>

      <ol className="mt-5 grid grid-cols-4 gap-1" aria-label="Proposal progress">
        {steps.map((step, i) => {
          const isCurrent = i === current;
          return (
            <li key={step.key} className="relative">
              {i > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    // From the previous node's centre to this one's.
                    "absolute right-1/2 top-[11px] h-px w-full",
                    steps[i - 1].done ? "bg-brand/50" : "bg-border"
                  )}
                />
              )}
              <button
                type="button"
                onClick={step.onClick}
                className="group relative flex w-full flex-col items-center gap-1.5 rounded-lg py-0.5 outline-none"
              >
                <span
                  className={cn(
                    "relative z-10 grid size-[23px] place-items-center rounded-full border text-[10px] transition-transform group-hover:scale-110 group-focus-visible:ring-2 group-focus-visible:ring-ring/50",
                    step.done && "border-brand bg-brand text-brand-fg",
                    isCurrent && "border-brand bg-card text-brand",
                    !step.done && !isCurrent && "border-border bg-card text-muted-foreground"
                  )}
                >
                  {step.done ? (
                    <CheckIcon className="size-3" strokeWidth={2.6} />
                  ) : isCurrent ? (
                    <span className="size-1.5 rounded-full bg-brand" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span
                  className={cn(
                    "text-[11.5px] transition-colors",
                    step.done || isCurrent ? "text-foreground" : "text-muted-foreground",
                    "group-hover:text-foreground"
                  )}
                >
                  {step.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {proposal ? (
        <ProposalPreview overview={overview} onShare={onShare} onRefined={onRefined} />
      ) : (
        <EmptyProposal overview={overview} openTool={openTool} />
      )}
    </HubCard>
  );
}

function ProposalPreview({
  overview,
  onShare,
  onRefined,
}: {
  overview: DealOverview;
  onShare: () => void;
  onRefined: () => void;
}) {
  const proposal = overview.proposal!;
  const name = overview.deal.client_company || overview.deal.client_name || "your client";
  const read = new Set(proposal.tracking.sections_viewed);

  const [asking, setAsking] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [refining, setRefining] = useState(false);
  const [changed, setChanged] = useState<Set<ProposalSectionKey>>(new Set());

  const refine = async () => {
    const text = instruction.trim();
    if (text.length < 3 || refining) return;
    setRefining(true);
    try {
      const res = await fetch(`/api/proposals/${proposal.id}/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: text }),
      });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { changed?: string[] };
      const keys = new Set(
        (body.changed ?? []).map((field) => FIELD_TO_SECTION[field]).filter(Boolean)
      );
      setChanged(keys);
      setInstruction("");
      setAsking(false);
      toast.success(
        keys.size ? `Updated ${keys.size} section${keys.size === 1 ? "" : "s"}.` : "No changes were needed."
      );
      onRefined();
      // The highlight is a nudge, not a state.
      setTimeout(() => setChanged(new Set()), 5000);
    } catch {
      toast.error("Couldn't apply that. Try rewording it.");
    } finally {
      setRefining(false);
    }
  };

  return (
    <div className="mt-5 rounded-xl border border-border bg-[color-mix(in_oklch,var(--background),var(--card)_40%)] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10.5px] font-medium uppercase tracking-[0.13em] text-muted-foreground">
            Proposal
          </div>
          <div className="mt-2 text-[19px] font-medium leading-snug tracking-[-0.03em]">
            Prepared for {name}
          </div>
          {proposal.data.challenge && (
            <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">
              {proposal.data.challenge}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Ask Claude to change the proposal"
          aria-expanded={asking}
          onClick={() => setAsking((v) => !v)}
          className={cn(asking && "border-brand/40 text-brand")}
        >
          <SparklesIcon className="size-4" strokeWidth={1.7} />
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {asking && (
          <motion.form
            key="ask"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
            onSubmit={(e) => {
              e.preventDefault();
              refine();
            }}
          >
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-brand/30 bg-card py-1 pl-3 pr-1 focus-within:border-brand">
              <input
                autoFocus
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                maxLength={500}
                placeholder="e.g. Tighten the approach and split the price into two phases"
                className="h-8 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
              />
              <Button
                type="submit"
                variant="brand"
                size="icon-sm"
                aria-label="Apply"
                disabled={refining || instruction.trim().length < 3}
              >
                {refining ? <Spinner className="size-3.5" /> : <ArrowUpIcon className="size-3.5" strokeWidth={2.2} />}
              </Button>
            </div>
            {refining && (
              <p className="shimmer-text mt-2 text-[12px]">Rewriting the sections this touches…</p>
            )}
          </motion.form>
        )}
      </AnimatePresence>

      <ol className="mt-4 divide-y divide-border border-y border-border">
        {PROPOSAL_SECTIONS.map((section, i) => {
          const preview = sectionPreview(proposal.data, section.key);
          const wasRead = read.has(section.key);
          const justChanged = changed.has(section.key);
          return (
            <li
              key={section.key}
              className={cn(
                "flex gap-3 py-3 transition-colors duration-700",
                justChanged && "bg-brand-soft/70"
              )}
            >
              <span className="w-5 shrink-0 pt-px text-[11.5px] font-medium tabular-nums text-brand">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium">{section.title}</span>
                  {wasRead && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-1.5 py-px text-[10.5px] font-medium text-success">
                      <EyeIcon className="size-3" strokeWidth={2} />
                      Read
                    </span>
                  )}
                </div>
                <p
                  className={cn(
                    "mt-0.5 line-clamp-2 text-[12px] leading-relaxed",
                    preview ? "text-muted-foreground" : "italic text-muted-foreground/70"
                  )}
                >
                  {preview || "Empty. Worth filling before this goes out."}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm" className="gap-1.5 text-[12.5px]">
          <Link href={`/proposals/${proposal.id}`}>
            <PencilSquareIcon className="size-3.5" strokeWidth={1.8} />
            Edit proposal
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="gap-1.5 text-[12.5px]">
          <a href="#tracking">
            <EyeIcon className="size-3.5" strokeWidth={1.8} />
            View tracking
          </a>
        </Button>
        <Button variant="outline" size="sm" onClick={onShare} className="gap-1.5 text-[12.5px]">
          <LinkIcon className="size-3.5" strokeWidth={1.8} />
          {proposal.share_token ? "Copy link" : "Create share link"}
        </Button>
      </div>
    </div>
  );
}

function EmptyProposal({
  overview,
  openTool,
}: {
  overview: DealOverview;
  openTool: (tool: HubTool) => void;
}) {
  const closed = overview.deal.stage === "won" || overview.deal.stage === "lost";
  return (
    <div className="mt-5 rounded-xl border border-dashed border-border px-5 py-8 text-center">
      <DocumentTextIcon className="mx-auto size-6 text-muted-foreground" strokeWidth={1.4} />
      <p className="mx-auto mt-3 max-w-[40ch] text-[13px] leading-relaxed text-muted-foreground">
        {closed
          ? "This deal closed without a proposal in Closingly."
          : "A proposal is written from what the client said. Record the next call, or paste in one you already had, and it will be drafted here."}
      </p>
      {!closed && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button asChild variant="brand" size="sm" className="gap-1.5 text-[12.5px]">
            <Link href="/meetings">
              <VideoCameraIcon className="size-3.5" strokeWidth={1.8} />
              Record or import a call
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => openTool("pricing")} className="text-[12.5px]">
            Work out the price first
          </Button>
        </div>
      )}
    </div>
  );
}
