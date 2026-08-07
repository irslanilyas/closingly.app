"use client";

import { useState } from "react";
import { AppShellClient } from "@/components/app-shell-client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton } from "@/components/copy-button";
import { tryParsePartialJson } from "@/lib/format";
import type { ScopeAnalysis } from "@/lib/types";
import {
  Loader2,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
} from "lucide-react";
import { toast } from "sonner";

export default function ScopeGuardianPage() {
  const [sow, setSow] = useState("");
  const [message, setMessage] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [result, setResult] = useState<Partial<ScopeAnalysis> | null>(null);

  const onAnalyze = async () => {
    if (!sow.trim() || !message.trim() || streaming) return;
    setStreaming(true);
    setResult({});
    try {
      const r = await fetch("/api/scope/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sow, message }),
      });
      if (!r.ok || !r.body) throw new Error();
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const parsed = tryParsePartialJson<Partial<ScopeAnalysis>>(acc);
        if (parsed) setResult(parsed);
      }
    } catch (err) {
      console.error(err);
      toast.error("Analysis failed");
    } finally {
      setStreaming(false);
    }
  };

  return (
    <AppShellClient>
      <PageHeader
        eyebrow="Module 7 / Protection"
        title="Scope Guardian"
        description="Compare original SOW vs new client request. Catch scope creep before it bills you."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        <div className="space-y-2">
          <Label className="text-[11.5px] uppercase tracking-[0.1em] font-medium text-muted-foreground">
            Original SOW / Project Scope
          </Label>
          <Textarea
            value={sow}
            onChange={(e) => setSow(e.target.value)}
            placeholder="Paste the original scope of work or agreement…"
            className="min-h-[200px] md:min-h-[280px] text-[13px] leading-relaxed font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-[11.5px] uppercase tracking-[0.1em] font-medium text-muted-foreground">
            New client message or request
          </Label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Paste their latest message asking for changes/additions…"
            className="min-h-[200px] md:min-h-[280px] text-[13px] leading-relaxed font-mono"
          />
        </div>
      </div>

      <div className="flex justify-center mb-8">
        <Button
          onClick={onAnalyze}
          disabled={!sow.trim() || !message.trim() || streaming}
          className="h-10 px-6 bg-[var(--accent-sage)] text-[var(--accent-sage-fg)] hover:bg-[var(--accent-sage)]/90 gap-2"
        >
          {streaming ? (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Analyzing…
            </>
          ) : (
            <>
              <ShieldCheck className="size-3.5" strokeWidth={1.75} /> Analyze
            </>
          )}
        </Button>
      </div>

      {(result?.verdict || streaming) && <VerdictPanel result={result} />}
    </AppShellClient>
  );
}

function VerdictPanel({ result }: { result: Partial<ScopeAnalysis> | null }) {
  if (!result) return null;
  const v = result.verdict;
  return (
    <div className="space-y-5">
      <VerdictCard verdict={v} />
      {result.reasoning && (
        <div className="rounded-md border border-border bg-card p-6">
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground mb-3 font-medium">
            Reasoning
          </div>
          <div className="text-[13.5px] text-foreground/85 leading-relaxed">
            {result.reasoning}
          </div>
        </div>
      )}
      {result.suggested_response && (
        <div className="rounded-md border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
              Suggested response
            </div>
            <CopyButton text={result.suggested_response} />
          </div>
          <div className="text-[13px] text-foreground/85 leading-relaxed whitespace-pre-wrap">
            {result.suggested_response}
          </div>
        </div>
      )}
      {result.estimated_additional_billing &&
        result.estimated_additional_billing !== "N/A" && (
          <div className="rounded-md border border-border bg-card p-6">
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground mb-2 font-medium">
              Estimated additional billing
            </div>
            <div className="text-[20px] font-medium tabular-nums tracking-tight text-[var(--accent-sage)]">
              {result.estimated_additional_billing}
            </div>
          </div>
        )}
    </div>
  );
}

function VerdictCard({ verdict }: { verdict?: ScopeAnalysis["verdict"] }) {
  const config = {
    in_scope: {
      label: "In Scope",
      Icon: ShieldCheck,
      cls: "bg-[var(--accent-sage)]/10 text-[var(--accent-sage)] border-[var(--accent-sage)]/30",
      copy: "This falls within the original agreement. Proceed.",
    },
    scope_creep: {
      label: "Scope Creep",
      Icon: ShieldAlert,
      cls: "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900",
      copy: "This goes beyond the original SOW. Bill or push back.",
    },
    grey_area: {
      label: "Grey Area",
      Icon: ShieldQuestion,
      cls: "bg-secondary text-foreground/80 border-border",
      copy: "Some elements are borderline. Worth a conversation.",
    },
  } as const;

  if (!verdict)
    return (
      <div className="rounded-md border border-border bg-card p-8 flex items-center gap-4 animate-pulse">
        <div className="size-10 rounded-full bg-secondary" />
        <div className="space-y-2">
          <div className="h-3.5 w-32 bg-secondary rounded" />
          <div className="h-3 w-48 bg-secondary rounded" />
        </div>
      </div>
    );

  const c = config[verdict];
  return (
    <div className={`rounded-md border p-8 flex items-center gap-5 ${c.cls}`}>
      <div className="size-12 rounded-full bg-background/60 flex items-center justify-center">
        <c.Icon className="size-6" strokeWidth={1.5} />
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] font-medium opacity-70">
          Verdict
        </div>
        <div className="text-[22px] font-medium tracking-tight mt-0.5">
          {c.label}
        </div>
        <div className="text-[12.5px] opacity-80 mt-1">{c.copy}</div>
      </div>
    </div>
  );
}
