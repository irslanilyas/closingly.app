"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShellClient } from "@/components/app-shell-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { StageBadge } from "@/components/stage-badge";
import { ProposalOutput } from "@/components/proposal-output";
import { ReplyCard } from "@/components/reply-card";
import { formatCurrency } from "@/lib/format";
import { type Deal, STAGE_LABELS, STAGE_ORDER } from "@/lib/types";
import { ArrowLeft, Loader2, Sparkles, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export default function DealDetailPage({
  params,
}: {
  params: Promise<{ deal_id: string }>;
}) {
  const { deal_id } = use(params);
  const router = useRouter();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/deals/${deal_id}`)
      .then((r) => r.json())
      .then((j) => setDeal(j.deal))
      .catch(() => toast.error("Couldn’t load deal"))
      .finally(() => setLoading(false));
  }, [deal_id]);

  const patch = async (partial: Partial<Deal>) => {
    setDeal((prev) => (prev ? { ...prev, ...partial } : prev));
    try {
      const r = await fetch(`/api/deals/${deal_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      if (!r.ok) throw new Error();
    } catch {
      toast.error("Save failed");
    }
  };

  if (loading)
    return (
      <AppShellClient>
        <div className="flex items-center gap-2 text-muted-foreground text-[13px]">
          <Loader2 className="size-3.5 animate-spin" /> Loading deal…
        </div>
      </AppShellClient>
    );

  if (!deal)
    return (
      <AppShellClient>
        <div className="text-[13px] text-muted-foreground">Deal not found.</div>
      </AppShellClient>
    );

  return (
    <AppShellClient>
      <div className="grid grid-cols-[1fr_240px] gap-10">
        <div>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[12px] text-muted-foreground mb-4 -ml-2"
          >
            <Link href="/pipeline">
              <ArrowLeft className="size-3.5 mr-1" /> Pipeline
            </Link>
          </Button>

          <div className="flex items-start justify-between gap-6 mb-2">
            <div className="min-w-0">
              <h1 className="text-[26px] font-medium tracking-tight leading-tight">
                {deal.client_name ?? "Unnamed"}
              </h1>
              <div className="mt-1 text-[14px] text-muted-foreground">
                {deal.client_company ?? "—"}
              </div>
            </div>
            <Select
              value={deal.stage}
              onValueChange={(v) => patch({ stage: v as Deal["stage"] })}
            >
              <SelectTrigger className="w-[180px] h-9 text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGE_ORDER.map((s) => (
                  <SelectItem key={s} value={s} className="text-[12.5px]">
                    {STAGE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="text-[11.5px] text-muted-foreground tabular-nums mb-8">
            Created {format(new Date(deal.created_at), "MMM d, yyyy")} · Updated{" "}
            {format(new Date(deal.updated_at), "MMM d, yyyy 'at' HH:mm")}
          </div>

          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="transcript">Transcript</TabsTrigger>
              <TabsTrigger value="proposal">Proposal</TabsTrigger>
              <TabsTrigger value="replies">Replies</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-6">
              <OverviewCard deal={deal} onPatch={patch} />
            </TabsContent>

            <TabsContent value="transcript" className="mt-6">
              <div className="rounded-md border border-border bg-card p-6">
                <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground mb-3 font-medium">
                  Original Transcript
                </div>
                <pre className="text-[12.5px] leading-relaxed whitespace-pre-wrap font-mono text-foreground/80 max-h-[600px] overflow-y-auto">
                  {deal.transcript || "—"}
                </pre>
              </div>
            </TabsContent>

            <TabsContent value="proposal" className="mt-6">
              {deal.proposal_data ? (
                <ProposalOutput
                  data={{
                    client_name: deal.client_name ?? "",
                    client_company: deal.client_company ?? "",
                    pain_point: deal.pain_point ?? "",
                    budget_signal: deal.budget_signal ?? "",
                    timeline: deal.timeline ?? "",
                    decision_maker: deal.decision_maker ?? "",
                    fit_score: deal.fit_score ?? 0,
                    proposal: deal.proposal_data,
                    suggested_replies: deal.suggested_replies ?? [],
                  }}
                />
              ) : (
                <div className="text-[13px] text-muted-foreground">
                  No proposal generated for this deal.
                </div>
              )}
            </TabsContent>

            <TabsContent value="replies" className="mt-6">
              {deal.suggested_replies && deal.suggested_replies.length > 0 ? (
                <div className="space-y-3">
                  {deal.suggested_replies.map((r, i) => (
                    <ReplyCard
                      key={i}
                      tone={r.tone}
                      subject={r.subject}
                      body={r.body}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-[13px] text-muted-foreground">
                  No replies on this deal yet.
                </div>
              )}
            </TabsContent>

            <TabsContent value="notes" className="mt-6">
              <NotesEditor
                initial={deal.notes ?? ""}
                onSave={(notes) => patch({ notes })}
              />
            </TabsContent>
          </Tabs>
        </div>

        <aside className="space-y-6">
          <div className="rounded-md border border-border bg-card p-4">
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground mb-3 font-medium">
              Activity
            </div>
            <ul className="space-y-2 text-[12px]">
              <li className="flex items-start gap-2">
                <span className="size-1.5 rounded-full bg-[var(--accent-sage)] mt-1.5 shrink-0" />
                <div>
                  <div className="text-foreground/80">Created</div>
                  <div className="text-muted-foreground tabular-nums text-[11px]">
                    {format(new Date(deal.created_at), "MMM d, HH:mm")}
                  </div>
                </div>
              </li>
              {deal.updated_at !== deal.created_at && (
                <li className="flex items-start gap-2">
                  <span className="size-1.5 rounded-full bg-foreground/30 mt-1.5 shrink-0" />
                  <div>
                    <div className="text-foreground/80">
                      Last updated · stage <em>{STAGE_LABELS[deal.stage]}</em>
                    </div>
                    <div className="text-muted-foreground tabular-nums text-[11px]">
                      {format(new Date(deal.updated_at), "MMM d, HH:mm")}
                    </div>
                  </div>
                </li>
              )}
            </ul>
          </div>

          <div className="rounded-md border border-border bg-card p-4">
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground mb-3 font-medium">
              Quick Actions
            </div>
            <div className="flex flex-col gap-1.5">
              <Link
                href={`/follow-up-writer?deal=${deal.id}`}
                className="text-[12.5px] inline-flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary transition-colors -mx-2"
              >
                <Sparkles className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
                Generate follow-up
              </Link>
              <Link
                href={`/scope-guardian?sow=${deal.id}`}
                className="text-[12.5px] inline-flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary transition-colors -mx-2"
              >
                <ShieldCheck className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
                Check scope
              </Link>
            </div>
          </div>

          <div className="rounded-md border border-border bg-card p-4">
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground mb-2 font-medium">
              Value
            </div>
            <div className="text-[20px] font-medium tabular-nums tracking-tight text-[var(--accent-sage)]">
              {deal.proposed_amount
                ? formatCurrency(deal.proposed_amount)
                : "—"}
            </div>
          </div>
        </aside>
      </div>
    </AppShellClient>
  );
}

function FieldRow({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div className="grid grid-cols-[140px_1fr] gap-4 items-start py-3 border-b border-border last:border-b-0">
      <Label className="text-[11.5px] uppercase tracking-[0.1em] text-muted-foreground font-medium pt-2">
        {label}
      </Label>
      {multiline ? (
        <Textarea
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => v !== value && onChange(v)}
          placeholder={placeholder}
          className="text-[13px] min-h-[64px] resize-y"
        />
      ) : (
        <Input
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => v !== value && onChange(v)}
          placeholder={placeholder}
          className="h-9 text-[13px]"
        />
      )}
    </div>
  );
}

function OverviewCard({
  deal,
  onPatch,
}: {
  deal: Deal;
  onPatch: (p: Partial<Deal>) => void;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-6 py-2">
      <FieldRow
        label="Client name"
        value={deal.client_name ?? ""}
        onChange={(v) => onPatch({ client_name: v })}
      />
      <FieldRow
        label="Company"
        value={deal.client_company ?? ""}
        onChange={(v) => onPatch({ client_company: v })}
      />
      <FieldRow
        label="Email"
        value={deal.client_email ?? ""}
        onChange={(v) => onPatch({ client_email: v })}
      />
      <FieldRow
        label="Pain point"
        value={deal.pain_point ?? ""}
        onChange={(v) => onPatch({ pain_point: v })}
        multiline
      />
      <FieldRow
        label="Budget signal"
        value={deal.budget_signal ?? ""}
        onChange={(v) => onPatch({ budget_signal: v })}
      />
      <FieldRow
        label="Timeline"
        value={deal.timeline ?? ""}
        onChange={(v) => onPatch({ timeline: v })}
      />
      <FieldRow
        label="Decision maker"
        value={deal.decision_maker ?? ""}
        onChange={(v) => onPatch({ decision_maker: v })}
      />
      <FieldRow
        label="Proposed amount"
        value={deal.proposed_amount?.toString() ?? ""}
        onChange={(v) =>
          onPatch({
            proposed_amount: v ? parseFloat(v.replace(/[^\d.]/g, "")) : null,
          })
        }
      />
      <FieldRow
        label="Fit score"
        value={deal.fit_score?.toString() ?? ""}
        onChange={(v) => {
          const n = parseInt(v, 10);
          if (!Number.isNaN(n) && n >= 1 && n <= 10)
            onPatch({ fit_score: n });
        }}
      />
    </div>
  );
}

function NotesEditor({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (v: string) => void;
}) {
  const [v, setV] = useState(initial);
  useEffect(() => setV(initial), [initial]);
  return (
    <Textarea
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== initial && onSave(v)}
      placeholder="Private notes — autosaves on blur."
      className="min-h-[300px] text-[13px] leading-relaxed"
    />
  );
}
