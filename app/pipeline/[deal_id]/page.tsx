"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShellClient } from "@/components/app-shell-client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProposalPanel } from "@/components/deal/proposal-panel";
import { FollowUpsPanel } from "@/components/deal/followups-panel";
import { PricingPanel } from "@/components/deal/pricing-panel";
import { ScopePanel } from "@/components/deal/scope-panel";
import { ActivityPanel } from "@/components/deal/activity-panel";
import { PostmortemPanel } from "@/components/deal/postmortem-panel";
import { CaseStudyPanel } from "@/components/deal/case-study-panel";
import { ClientHealthCard } from "@/components/deal/client-health-card";
import { DealNotes } from "@/components/deal/notes";
import { TranscriptPlayer } from "@/components/deal/transcript-player";
import { formatCurrency } from "@/lib/format";
import { type Deal, STAGE_LABELS, STAGE_ORDER } from "@/lib/types";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export default function DealDetailPage({
  params,
}: {
  params: Promise<{ deal_id: string }>;
}) {
  const { deal_id } = use(params);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/deals/${deal_id}`)
      .then((r) => r.json())
      .then((j) => setDeal(j.deal))
      .catch(() => toast.error("Couldn't load this deal."))
      .finally(() => setLoading(false));
  }, [deal_id]);

  const patch = useCallback(
    async (partial: Partial<Deal>) => {
      setDeal((prev) => (prev ? { ...prev, ...partial } : prev));
      try {
        const res = await fetch(`/api/deals/${deal_id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(partial),
        });
        if (!res.ok) throw new Error();
      } catch {
        toast.error("Couldn't save that change.");
      }
    },
    [deal_id]
  );

  if (loading) {
    return (
      <AppShellClient>
        <div className="space-y-6 max-w-[900px]">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-8 w-full max-w-[420px]" />
          <Skeleton className="h-[300px] w-full" />
        </div>
      </AppShellClient>
    );
  }

  if (!deal) {
    return (
      <AppShellClient>
        <div className="py-20 text-center">
          <div className="text-[15px] font-medium">Deal not found</div>
          <Link
            href="/pipeline"
            className="mt-3 inline-block text-[13px] text-muted-foreground hover:text-foreground underline underline-offset-4"
          >
            Back to pipeline
          </Link>
        </div>
      </AppShellClient>
    );
  }

  return (
    <AppShellClient>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-8 lg:gap-12">
        <div className="min-w-0">
          <Link
            href="/pipeline"
            className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground transition-colors mb-5"
          >
            <ArrowLeft className="size-3.5" strokeWidth={1.5} />
            Pipeline
          </Link>

          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-1.5">
            <div className="min-w-0">
              <h1 className="text-[26px] font-medium tracking-tight leading-tight">
                {deal.client_name ?? "Unnamed"}
              </h1>
              <div className="mt-1 text-[14px] text-muted-foreground">
                {deal.client_company ?? "—"}
              </div>
              <div className="mt-2.5 flex items-baseline gap-2.5 lg:hidden">
                <span className="text-[20px] font-medium tabular-nums tracking-tight text-[var(--brand)]">
                  {deal.proposed_amount
                    ? formatCurrency(deal.proposed_amount)
                    : "No value yet"}
                </span>
                {deal.fit_score != null && (
                  <span className="text-[12px] text-muted-foreground">
                    Fit {deal.fit_score}/10
                  </span>
                )}
              </div>
            </div>
            <Select
              value={deal.stage}
              onValueChange={(v) => patch({ stage: v as Deal["stage"] })}
            >
              <SelectTrigger className="w-full sm:w-[180px] h-9 text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGE_ORDER.map((stage) => (
                  <SelectItem
                    key={stage}
                    value={stage}
                    className="text-[12.5px]"
                  >
                    {STAGE_LABELS[stage]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="text-[11.5px] text-muted-foreground tabular-nums mb-6 sm:mb-8">
            Created {format(new Date(deal.created_at), "MMM d, yyyy")}
          </div>

          <Tabs defaultValue="proposal">
            <div className="-mx-4 -my-1 overflow-x-auto px-4 py-1 scrollbar-none sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
            <TabsList className="min-w-max">
              <TabsTrigger value="proposal">Proposal</TabsTrigger>
              <TabsTrigger value="pricing">Pricing</TabsTrigger>
              <TabsTrigger value="followups">Follow-ups</TabsTrigger>
              <TabsTrigger value="scope">Scope</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="transcript">Transcript</TabsTrigger>
              {deal.stage === "lost" && (
                <TabsTrigger value="wrapup">Post-mortem</TabsTrigger>
              )}
              {deal.stage === "won" && (
                <TabsTrigger value="wrapup">Case Study</TabsTrigger>
              )}
            </TabsList>
            </div>

            <TabsContent value="proposal" className="mt-6">
              <ProposalPanel dealId={deal.id} />
            </TabsContent>

            <TabsContent value="pricing" className="mt-6">
              <PricingPanel deal={deal} />
            </TabsContent>

            <TabsContent value="followups" className="mt-6">
              <FollowUpsPanel deal={deal} />
            </TabsContent>

            <TabsContent value="scope" className="mt-6">
              <ScopePanel dealId={deal.id} />
            </TabsContent>

            <TabsContent value="details" className="mt-6">
              <DetailsPanel deal={deal} onPatch={patch} />
            </TabsContent>

            <TabsContent value="transcript" className="mt-6">
              <TranscriptPlayer
                dealId={deal.id}
                fallbackTranscript={deal.transcript}
              />
            </TabsContent>

            {deal.stage === "lost" && (
              <TabsContent value="wrapup" className="mt-6">
                <PostmortemPanel dealId={deal.id} />
              </TabsContent>
            )}

            {deal.stage === "won" && (
              <TabsContent value="wrapup" className="mt-6">
                <CaseStudyPanel dealId={deal.id} />
              </TabsContent>
            )}
          </Tabs>
        </div>

        <aside className="space-y-8">
          <section className="hidden lg:block">
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground mb-3 font-medium">
              Value
            </div>
            <div className="text-[24px] font-medium tabular-nums tracking-tight text-[var(--brand)]">
              {deal.proposed_amount
                ? formatCurrency(deal.proposed_amount)
                : "—"}
            </div>
            {deal.fit_score != null && (
              <div className="mt-1 text-[12px] text-muted-foreground">
                Fit {deal.fit_score}/10
              </div>
            )}
          </section>

          <ClientHealthCard dealId={deal.id} stage={deal.stage} />

          <DealNotes dealId={deal.id} legacyNote={deal.notes} />

          {deal.competitor_mentioned && (
            <section>
              <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground mb-3 font-medium">
                Competitive intel
              </div>
              <div className="rounded-md border border-border bg-card px-3.5 py-3 space-y-1.5">
                <div className="text-[13px] font-medium">
                  {deal.competitor_mentioned}
                </div>
                {deal.competitive_note && (
                  <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                    {deal.competitive_note}
                  </p>
                )}
              </div>
            </section>
          )}

          <section>
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground mb-4 font-medium">
              Activity
            </div>
            <ActivityPanel dealId={deal.id} />
          </section>
        </aside>
      </div>
    </AppShellClient>
  );
}

/**
 * Local draft state so typing isn't fighting the network, committed on blur.
 * Both editors below follow the same pattern the old page repeated inline for
 * every single field.
 */
function AutosaveTextarea({
  value,
  onSave,
  placeholder,
  className,
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <Textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onSave(draft)}
      placeholder={placeholder}
      className={`text-[13px] leading-relaxed ${className ?? ""}`}
    />
  );
}

function AutosaveInput({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <Input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onSave(draft)}
      className="h-9 text-[13px]"
    />
  );
}

/** Driven by a table rather than nine hand-written field blocks. */
const DETAIL_FIELDS = [
  { key: "client_name", label: "Client name", multiline: false },
  { key: "client_company", label: "Company", multiline: false },
  { key: "client_email", label: "Email", multiline: false },
  { key: "pain_point", label: "Pain point", multiline: true },
  { key: "budget_signal", label: "Budget signal", multiline: true },
  { key: "timeline", label: "Timeline", multiline: false },
  { key: "decision_maker", label: "Decision maker", multiline: false },
] as const;

function DetailsPanel({
  deal,
  onPatch,
}: {
  deal: Deal;
  onPatch: (p: Partial<Deal>) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 sm:px-5">
      {DETAIL_FIELDS.map((field) => (
        <Row key={field.key} label={field.label}>
          {field.multiline ? (
            <AutosaveTextarea
              value={(deal[field.key] as string | null) ?? ""}
              onSave={(v) => onPatch({ [field.key]: v })}
              className="min-h-[68px] resize-y"
            />
          ) : (
            <AutosaveInput
              value={(deal[field.key] as string | null) ?? ""}
              onSave={(v) => onPatch({ [field.key]: v })}
            />
          )}
        </Row>
      ))}

      <Row label="Proposed amount">
        <AutosaveInput
          value={deal.proposed_amount?.toString() ?? ""}
          onSave={(v) =>
            onPatch({
              proposed_amount: v ? parseFloat(v.replace(/[^\d.]/g, "")) : null,
            })
          }
        />
      </Row>

      <Row label="Estimated hours">
        <AutosaveInput
          value={deal.estimated_hours?.toString() ?? ""}
          onSave={(v) =>
            onPatch({
              estimated_hours: v ? parseFloat(v.replace(/[^\d.]/g, "")) : null,
            })
          }
        />
      </Row>

      <Row label="Start date">
        <Input
          type="date"
          value={deal.start_date ?? ""}
          onChange={(e) => onPatch({ start_date: e.target.value || null })}
          className="h-9 text-[13px]"
        />
      </Row>

      <Row label="Target end date">
        <Input
          type="date"
          value={deal.target_end_date ?? ""}
          onChange={(e) =>
            onPatch({ target_end_date: e.target.value || null })
          }
          className="h-9 text-[13px]"
        />
      </Row>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-2 sm:gap-4 items-start py-3 border-b border-border last:border-b-0">
      <Label className="text-[11.5px] uppercase tracking-[0.1em] text-muted-foreground font-medium pt-2">
        {label}
      </Label>
      {children}
    </div>
  );
}
