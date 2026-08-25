"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton } from "@/components/copy-button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStreamingJson } from "@/lib/hooks/use-streaming-json";
import { createClient } from "@/lib/supabase/client";
import type { ProposalData, ScopeAnalysis } from "@/lib/types";
import {
  Loader2,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
} from "lucide-react";

/**
 * The standalone page made you paste the SOW by hand every time — even though
 * the system already had it. Here it's assembled from the deal's own proposal.
 */
export function ScopePanel({ dealId }: { dealId: string }) {
  const [sow, setSow] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const { data, streaming, run } = useStreamingJson<ScopeAnalysis>(
    "/api/scope/analyze"
  );

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("proposals")
      .select("proposal_data")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const proposal = data?.[0]?.proposal_data as ProposalData | undefined;
        setSow(proposal ? sowFromProposal(proposal) : "");
      });
  }, [dealId]);

  if (sow === null) return <Skeleton className="h-[200px] w-full rounded-md" />;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[11.5px] uppercase tracking-[0.1em] font-medium text-muted-foreground">
            Agreed scope
          </label>
          {sow && (
            <span className="text-[11px] text-[var(--accent-sage)]">
              Loaded from this deal&rsquo;s proposal
            </span>
          )}
        </div>
        <Textarea
          value={sow}
          onChange={(e) => setSow(e.target.value)}
          placeholder="No proposal on this deal yet — paste the agreed scope here."
          className="min-h-[160px] text-[12.5px] leading-relaxed font-mono"
        />
      </div>

      <div className="space-y-2">
        <label className="text-[11.5px] uppercase tracking-[0.1em] font-medium text-muted-foreground block">
          What are they asking for now?
        </label>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Paste their latest message…"
          className="min-h-[120px] text-[12.5px] leading-relaxed"
        />
      </div>

      <Button
        onClick={() => run({ sow, message })}
        disabled={!sow.trim() || !message.trim() || streaming}
        className="h-9 px-4 text-[12.5px] gap-2 bg-[var(--accent-sage)] text-[var(--accent-sage-fg)] hover:bg-[var(--accent-sage)]/90 cursor-pointer"
      >
        {streaming ? (
          <>
            <Loader2 className="size-3.5 animate-spin" /> Checking…
          </>
        ) : (
          <>
            <ShieldCheck className="size-3.5" strokeWidth={1.75} /> Check for
            scope creep
          </>
        )}
      </Button>

      {(data?.verdict || streaming) && <Verdict result={data} />}
    </div>
  );
}

/** Flattens the structured proposal back into prose the scope prompt can read. */
function sowFromProposal(proposal: ProposalData): string {
  return [
    proposal.approach,
    "",
    "Deliverables:",
    ...(proposal.deliverables ?? []).map((d) => `- ${d}`),
    "",
    `Timeline: ${proposal.timeline_phased ?? "—"}`,
    `Investment: ${proposal.investment_number ?? "—"} (${proposal.investment_terms ?? "—"})`,
  ].join("\n");
}

const VERDICTS = {
  in_scope: {
    label: "In scope",
    Icon: ShieldCheck,
    cls: "bg-[var(--accent-sage)]/10 text-[var(--accent-sage)] border-[var(--accent-sage)]/30",
    copy: "This falls within what was agreed. Proceed.",
  },
  scope_creep: {
    label: "Scope creep",
    Icon: ShieldAlert,
    cls: "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900",
    copy: "This goes beyond the agreement. Bill for it or push back.",
  },
  grey_area: {
    label: "Grey area",
    Icon: ShieldQuestion,
    cls: "bg-secondary text-foreground/80 border-border",
    copy: "Borderline. Worth a conversation before you commit.",
  },
} as const;

function Verdict({ result }: { result: Partial<ScopeAnalysis> | null }) {
  if (!result?.verdict) {
    return <Skeleton className="h-[92px] w-full rounded-md" />;
  }

  const config = VERDICTS[result.verdict];

  return (
    <div className="space-y-4">
      <div className={`rounded-md border p-6 flex items-center gap-4 ${config.cls}`}>
        <div className="size-10 rounded-full bg-background/60 flex items-center justify-center shrink-0">
          <config.Icon className="size-5" strokeWidth={1.5} />
        </div>
        <div>
          <div className="text-[19px] font-medium tracking-tight">
            {config.label}
          </div>
          <div className="text-[12.5px] opacity-80 mt-0.5">{config.copy}</div>
        </div>
      </div>

      {result.reasoning && (
        <Card title="Reasoning">
          <p className="text-[13px] leading-relaxed text-foreground/85">
            {result.reasoning}
          </p>
        </Card>
      )}

      {result.suggested_response && (
        <Card
          title="Suggested reply"
          action={<CopyButton text={result.suggested_response} />}
        >
          <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-foreground/85">
            {result.suggested_response}
          </p>
        </Card>
      )}

      {result.estimated_additional_billing &&
        result.estimated_additional_billing !== "N/A" && (
          <Card title="Worth billing">
            <div className="text-[19px] font-medium tabular-nums tracking-tight text-[var(--accent-sage)]">
              {result.estimated_additional_billing}
            </div>
          </Card>
        )}
    </div>
  );
}

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
          {title}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
