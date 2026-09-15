"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import { useStreamingJson } from "@/lib/hooks/use-streaming-json";
import type { Deal, PricingResult } from "@/lib/types";
import { Loader2, Sparkles } from "lucide-react";

/**
 * What should I charge *this* client?
 *
 * The standalone page made you retype the project, the budget signal and the
 * timeline by hand — every one of which the transcript already extracted onto
 * the deal. Prefilled from the deal, this stops being a worse ChatGPT and
 * starts being something only a tool holding the conversation can do. The
 * fields stay editable because the extraction is a starting point, not gospel.
 */
export function PricingPanel({ deal }: { deal: Deal }) {
  const initial = useMemo(
    () => ({
      desc: [deal.pain_point, deal.timeline ? `Timeline: ${deal.timeline}` : ""]
        .filter(Boolean)
        .join("\n\n"),
      industry: deal.client_company ?? "",
      budget: deal.budget_signal ?? "",
      timeline: deal.timeline ?? "",
    }),
    [deal]
  );

  const [desc, setDesc] = useState(initial.desc);
  const [industry, setIndustry] = useState(initial.industry);
  const [scope, setScope] = useState("Medium");
  const [budget, setBudget] = useState(initial.budget);
  const [timeline, setTimeline] = useState(initial.timeline);

  const { data: result, streaming, run } = useStreamingJson<PricingResult>(
    "/api/pricing/generate"
  );

  const prefilled = Boolean(initial.desc || initial.budget || initial.timeline);

  return (
    <div className="space-y-6">
      {prefilled && (
        <p className="text-[12px] text-[var(--brand)]">
          Prefilled from this deal — edit anything that looks off.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2 space-y-2">
          <FieldLabel htmlFor="pricing-desc">Project description</FieldLabel>
          <Textarea
            id="pricing-desc"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="What are you building, and for whom?"
            className="min-h-[120px] text-[13px] leading-relaxed"
          />
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="pricing-industry">Client industry</FieldLabel>
          <Input
            id="pricing-industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="Apparel, SaaS, real estate…"
            className="h-9 text-[13px]"
          />
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="pricing-scope">Estimated scope</FieldLabel>
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger id="pricing-scope" className="h-9 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["Small", "Medium", "Large"].map((s) => (
                <SelectItem key={s} value={s} className="text-[13px]">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="pricing-budget">Budget signal</FieldLabel>
          <Input
            id="pricing-budget"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="What did they say about money?"
            className="h-9 text-[13px]"
          />
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="pricing-timeline">Timeline</FieldLabel>
          <Input
            id="pricing-timeline"
            value={timeline}
            onChange={(e) => setTimeline(e.target.value)}
            placeholder="2 weeks, 3 months, end of Q2…"
            className="h-9 text-[13px]"
          />
        </div>
      </div>

      <Button
        onClick={() =>
          run({
            project_description: desc,
            industry,
            scope,
            budget_signal: budget,
            timeline,
          })
        }
        disabled={!desc.trim() || streaming}
        className="h-9 px-4 text-[12.5px] gap-2 bg-[var(--brand)] text-[var(--brand-fg)] hover:bg-[var(--brand)]/90 cursor-pointer"
      >
        {streaming ? (
          <>
            <Loader2 className="size-3.5 animate-spin" /> Calculating…
          </>
        ) : (
          <>
            <Sparkles className="size-3.5" strokeWidth={1.75} /> Recommend a
            price
          </>
        )}
      </Button>

      {(result || streaming) && (
        <div className="space-y-4">
          <PriceCard result={result} current={deal.proposed_amount} />
          <ReasoningCard result={result} />
        </div>
      )}
    </div>
  );
}

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <Label
      htmlFor={htmlFor}
      className="text-[11.5px] uppercase tracking-[0.1em] font-medium text-muted-foreground"
    >
      {children}
    </Label>
  );
}

function PriceCard({
  result,
  current,
}: {
  result: Partial<PricingResult> | null;
  current: number | null;
}) {
  if (!result) return <Skeleton className="h-[160px] w-full rounded-lg" />;
  const currency = result.currency ?? "USD";

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-baseline justify-between mb-5">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
          Recommended price
        </div>
        {current ? (
          // The whole reason to run this from inside a deal: you can see the
          // recommendation next to what you already quoted.
          <div className="text-[11.5px] text-muted-foreground tabular-nums">
            Currently quoted {formatCurrency(current)}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-4 sm:gap-6">
        <PricePill label="Low" amount={result.price_low} currency={currency} />
        <PricePill
          label="Mid"
          amount={result.price_mid}
          currency={currency}
          headline
        />
        <PricePill label="High" amount={result.price_high} currency={currency} />
      </div>

      {result.confidence && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span
            className={`text-[10.5px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full border font-medium ${
              result.confidence === "high"
                ? "bg-[var(--brand)]/10 text-[var(--brand)] border-[var(--brand)]/25"
                : result.confidence === "medium"
                  ? "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900"
                  : "bg-secondary text-muted-foreground border-border"
            }`}
          >
            {result.confidence} confidence
          </span>
          {result.confidence_reason && (
            <span className="text-[12px] text-muted-foreground">
              {result.confidence_reason}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function PricePill({
  label,
  amount,
  currency,
  headline,
}: {
  label: string;
  amount?: number;
  currency: string;
  headline?: boolean;
}) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5 font-medium">
        {label}
      </div>
      <div
        className={`tabular-nums tracking-tight font-medium ${
          headline
            ? "text-[24px] sm:text-[30px] text-[var(--brand)]"
            : "text-[17px] sm:text-[19px] text-foreground/80"
        }`}
      >
        {amount ? formatCurrency(amount, currency) : "—"}
      </div>
    </div>
  );
}

function ReasoningCard({ result }: { result: Partial<PricingResult> | null }) {
  if (!result?.reasoning?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground mb-4 font-medium">
        Reasoning
      </div>
      <ul className="space-y-2">
        {result.reasoning.map((r, i) => (
          <li key={i} className="text-[13px] flex gap-3 leading-relaxed">
            <span className="text-muted-foreground/50 tabular-nums shrink-0">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
