"use client";

import { useEffect, useState } from "react";
import { AppShellClient } from "@/components/app-shell-client";
import { PageHeader } from "@/components/page-header";
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
import { tryParsePartialJson, formatCurrency } from "@/lib/format";
import type { Deal, PricingResult } from "@/lib/types";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function PricingAdvisorPage() {
  const [desc, setDesc] = useState("");
  const [industry, setIndustry] = useState("");
  const [scope, setScope] = useState("Medium");
  const [budget, setBudget] = useState("");
  const [timeline, setTimeline] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [result, setResult] = useState<Partial<PricingResult> | null>(null);
  const [comparables, setComparables] = useState<Deal[]>([]);

  useEffect(() => {
    fetch("/api/deals")
      .then((r) => r.json())
      .then((j) => setComparables(j.deals ?? []));
  }, []);

  const onGenerate = async () => {
    if (!desc.trim() || streaming) return;
    setStreaming(true);
    setResult({});
    try {
      const r = await fetch("/api/pricing/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_description: desc,
          industry,
          scope,
          budget_signal: budget,
          timeline,
        }),
      });
      if (!r.ok || !r.body) throw new Error();
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const parsed = tryParsePartialJson<Partial<PricingResult>>(acc);
        if (parsed) setResult(parsed);
      }
    } catch (err) {
      console.error(err);
      toast.error("Generation failed");
    } finally {
      setStreaming(false);
    }
  };

  const relevantComparables = comparables
    .filter((d) => {
      if (!industry) return false;
      const ind = industry.toLowerCase();
      return (
        (d.client_company ?? "").toLowerCase().includes(ind) ||
        (d.pain_point ?? "").toLowerCase().includes(ind)
      );
    })
    .slice(0, 5);

  return (
    <AppShellClient>
      <PageHeader
        eyebrow="Module 4 / Pricing"
        title="Pricing Advisor"
        description="Recommend a price range for a new project. Grounded in your own past deals."
      />

      <div className="max-w-[640px] space-y-5">
        <Field label="Project description">
          <Textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="What are you building, and for whom?"
            className="min-h-[150px] text-[13px] leading-relaxed"
          />
        </Field>
        <Field label="Client industry">
          <Input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="Apparel, SaaS, real estate…"
            className="h-9 text-[13px]"
          />
        </Field>
        <Field label="Estimated scope">
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger className="h-9 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Small" className="text-[13px]">
                Small
              </SelectItem>
              <SelectItem value="Medium" className="text-[13px]">
                Medium
              </SelectItem>
              <SelectItem value="Large" className="text-[13px]">
                Large
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Budget signal (optional)">
          <Input
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="What did they say about money?"
            className="h-9 text-[13px]"
          />
        </Field>
        <Field label="Timeline">
          <Input
            value={timeline}
            onChange={(e) => setTimeline(e.target.value)}
            placeholder="2 weeks, 3 months, end of Q2…"
            className="h-9 text-[13px]"
          />
        </Field>
        <Button
          onClick={onGenerate}
          disabled={!desc.trim() || streaming}
          className="h-10 px-5 bg-[var(--accent-sage)] text-[var(--accent-sage-fg)] hover:bg-[var(--accent-sage)]/90 gap-2"
        >
          {streaming ? (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Calculating…
            </>
          ) : (
            <>
              <Sparkles className="size-3.5" strokeWidth={1.75} /> Generate
            </>
          )}
        </Button>
      </div>

      {(result || streaming) && (
        <div className="mt-10 space-y-5 max-w-[820px]">
          <PriceCard result={result} />
          <ReasoningCard result={result} />
          <ComparablesCard deals={relevantComparables} />
        </div>
      )}
    </AppShellClient>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-[11.5px] uppercase tracking-[0.1em] font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function PriceCard({ result }: { result: Partial<PricingResult> | null }) {
  if (!result) return null;
  const currency = result.currency ?? "USD";
  return (
    <div className="rounded-md border border-border bg-card p-7">
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground mb-5 font-medium">
        Recommended Price
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
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
        <div className="mt-6 flex items-center gap-2">
          <span
            className={`text-[10.5px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full border font-medium ${
              result.confidence === "high"
                ? "bg-[var(--accent-sage)]/10 text-[var(--accent-sage)] border-[var(--accent-sage)]/25"
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
            ? "text-[24px] sm:text-[32px] text-[var(--accent-sage)]"
            : "text-[18px] sm:text-[20px] text-foreground/80"
        }`}
      >
        {amount ? formatCurrency(amount, currency) : "—"}
      </div>
    </div>
  );
}

function ReasoningCard({ result }: { result: Partial<PricingResult> | null }) {
  if (!result?.reasoning || result.reasoning.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-card p-6">
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

function ComparablesCard({ deals }: { deals: Deal[] }) {
  return (
    <div className="rounded-md border border-border bg-card p-6">
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground mb-4 font-medium">
        Comparable past deals
      </div>
      {deals.length === 0 ? (
        <div className="text-[13px] text-muted-foreground">
          No comparable deals yet.
        </div>
      ) : (
        <div className="divide-y divide-border overflow-x-auto">
          {deals.map((d) => (
            <div
              key={d.id}
              className="grid grid-cols-[1fr_1fr_140px] gap-4 py-3 items-center min-w-[400px]"
            >
              <div className="text-[13px] font-medium truncate">
                {d.client_name ?? "Unnamed"}
              </div>
              <div className="text-[12.5px] text-muted-foreground truncate">
                {d.client_company ?? "—"}
              </div>
              <div className="text-[13px] tabular-nums text-right">
                {d.proposed_amount
                  ? formatCurrency(d.proposed_amount)
                  : "—"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
