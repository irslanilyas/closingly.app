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
import { CheckIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { Spinner } from "@/components/ui/spinner";
import { RevealText } from "@/components/ui/reveal-text";

/**
 * What should I charge *this* client?
 *
 * The standalone page made you retype the project, the budget signal and the
 * timeline by hand — every one of which the transcript already extracted onto
 * the deal. Prefilled from the deal, this stops being a worse ChatGPT and
 * starts being something only a tool holding the conversation can do. The
 * fields stay editable because the extraction is a starting point, not gospel.
 */
export function PricingPanel({
  deal,
  onApply,
}: {
  deal: Deal;
  /** Puts a recommended figure on the deal as its value. */
  onApply?: (amount: number) => void;
}) {
  const initial = useMemo(
    () => ({
      desc: [deal.pain_point, deal.timeline ? `Timeline: ${deal.timeline}` : ""]
        .filter(Boolean)
        .join("\n\n"),
      // Nothing on the deal records the industry; the company name is not one.
      industry: "",
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
          Prefilled from this deal. Edit anything that looks off.
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
        variant="brand"
        className="h-9 gap-2 px-4 text-[12.5px]"
      >
        {streaming ? (
          <>
            <Spinner className="size-3.5" /> <span className="shimmer-text">Weighing the scope and the budget…</span>
          </>
        ) : (
          <>
            <SparklesIcon className="size-3.5" strokeWidth={1.75} /> Recommend a
            price
          </>
        )}
      </Button>

      {(result || streaming) && (
        <div className="space-y-4">
          <PriceCard
            result={result}
            current={deal.proposed_amount}
            onApply={streaming ? undefined : onApply}
          />
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
  onApply,
}: {
  result: Partial<PricingResult> | null;
  current: number | null;
  onApply?: (amount: number) => void;
}) {
  if (!result) return <Skeleton className="h-[160px] w-full rounded-lg" />;
  const currency = result.currency ?? "USD";

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 sm:mb-5">
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

      {/* Mid first on a phone: the number to quote on its own line, the
          range side by side beneath it. Three equal columns left ~90px for a
          figure that can run to "PKR 1,250,000". */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6">
        <div className="col-span-2 sm:order-2 sm:col-span-1">
          <PricePill
            label="Mid"
            amount={result.price_mid}
            currency={currency}
            headline
          />
        </div>
        <div className="sm:order-1">
          <PricePill label="Low" amount={result.price_low} currency={currency} />
        </div>
        <div className="sm:order-3">
          <PricePill label="High" amount={result.price_high} currency={currency} />
        </div>
      </div>

      {result.confidence && (
        <div className="mt-5 flex flex-wrap items-center gap-2 sm:mt-6">
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

      {onApply && result.price_mid != null && result.price_mid !== current && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onApply(result.price_mid as number)}
          className="mt-5 gap-1.5"
        >
          <CheckIcon className="size-3.5" strokeWidth={2} />
          Use {formatCurrency(result.price_mid, result.currency ?? "USD")} as the deal value
        </Button>
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
            ? "text-[28px] sm:text-[30px] text-[var(--brand)]"
            : "text-[17px] sm:text-[19px] text-foreground/80"
        }`}
      >
        {amount ? formatCurrency(amount, currency) : <span className="shimmer-text">Working</span>}
      </div>
    </div>
  );
}

function ReasoningCard({ result }: { result: Partial<PricingResult> | null }) {
  if (!result?.reasoning?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground mb-4 font-medium">
        Reasoning
      </div>
      <ul className="space-y-2">
        {result.reasoning.map((r, i) => (
          <li key={i} className="text-[13px] flex gap-3 leading-relaxed">
            <span className="text-muted-foreground/50 tabular-nums shrink-0">
              {String(i + 1).padStart(2, "0")}
            </span>
            <RevealText text={r} />
          </li>
        ))}
      </ul>
    </div>
  );
}
