"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import type { ProposalData } from "@/lib/types";
import { FileText, ArrowUpRight, Link2, Eye } from "lucide-react";

interface DealProposal {
  id: string;
  proposal_data: ProposalData;
  status: string;
  share_token: string | null;
  created_at: string;
}

/**
 * Reads from the `proposals` table — not the deprecated `deals.proposal_data`
 * column the old page used, which is why proposals created by the meeting
 * agent showed up as "no proposal generated".
 */
export function ProposalPanel({ dealId }: { dealId: string }) {
  const [proposals, setProposals] = useState<DealProposal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("proposals")
      .select("id, proposal_data, status, share_token, created_at")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setProposals(data as DealProposal[]);
        setLoading(false);
      });
  }, [dealId]);

  if (loading) return <Skeleton className="h-[140px] w-full rounded-md" />;

  if (proposals.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
        <FileText
          className="size-5 mx-auto text-muted-foreground mb-3"
          strokeWidth={1.5}
        />
        <div className="text-[13.5px] font-medium">No proposal yet</div>
        <p className="mt-1.5 mx-auto max-w-[360px] text-[12.5px] text-muted-foreground leading-relaxed">
          Record a discovery call with the meeting agent and one gets drafted
          automatically, or write one from the transcript.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {proposals.map((proposal) => (
        <Link
          key={proposal.id}
          href={`/proposals/${proposal.id}`}
          className="group block rounded-lg border border-border bg-card px-4 py-4 sm:px-5 hover:border-[var(--brand)]/40 transition-colors"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13.5px] font-medium">
                  {proposal.proposal_data?.investment_number ?? "Proposal"}
                </span>
                <StatusPill status={proposal.status} />
              </div>
              <p className="mt-1.5 text-[12.5px] text-muted-foreground line-clamp-2 leading-relaxed">
                {proposal.proposal_data?.challenge ?? "—"}
              </p>
              <div className="mt-2.5 flex items-center gap-3 text-[11.5px] text-muted-foreground">
                <span>
                  {proposal.proposal_data?.deliverables?.length ?? 0}{" "}
                  deliverables
                </span>
                {proposal.share_token && (
                  <span className="flex items-center gap-1">
                    <Link2 className="size-3" strokeWidth={1.5} />
                    Shared
                  </span>
                )}
              </div>
            </div>
            <ArrowUpRight
              className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors"
              strokeWidth={1.5}
            />
          </div>
        </Link>
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-secondary text-muted-foreground",
    shared: "bg-[var(--brand)]/10 text-[var(--brand)]",
    accepted: "bg-[var(--brand)]/15 text-[var(--brand)]",
    rejected: "bg-secondary text-muted-foreground",
  };

  return (
    <span
      className={`text-[10px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-sm font-medium ${styles[status] ?? styles.draft}`}
    >
      {status}
    </span>
  );
}
