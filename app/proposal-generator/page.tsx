"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShellClient } from "@/components/app-shell-client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProposalOutput } from "@/components/proposal-output";
import { tryParsePartialJson, parseAmountFromString } from "@/lib/format";
import { ProposalGeneration } from "@/lib/types";
import { Loader2, Sparkles, Save } from "lucide-react";
import { toast } from "sonner";

export default function ProposalGeneratorPage() {
  return (
    <Suspense fallback={null}>
      <ProposalGeneratorInner />
    </Suspense>
  );
}

function ProposalGeneratorInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [clientName, setClientName] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [transcript, setTranscript] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [output, setOutput] = useState<Partial<ProposalGeneration> | null>(
    null
  );
  const [raw, setRaw] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Preload transcript from query (?from=transcriber) or sessionStorage
  useEffect(() => {
    if (search.get("from") === "transcriber") {
      const t = sessionStorage.getItem("cleaned_transcript");
      if (t) {
        setTranscript(t);
        sessionStorage.removeItem("cleaned_transcript");
      }
    }
  }, [search]);

  const onGenerate = async () => {
    if (!transcript.trim() || streaming) return;
    setStreaming(true);
    setOutput({});
    setRaw("");
    setSavedId(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/proposal/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Generation failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setRaw(acc);
        const parsed = tryParsePartialJson<Partial<ProposalGeneration>>(acc);
        if (parsed) setOutput(parsed);
      }
      // Final parse
      const final = tryParsePartialJson<Partial<ProposalGeneration>>(acc);
      if (final) setOutput(final);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error(err);
        toast.error("Generation failed. Try again.");
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const onSaveToPipeline = async () => {
    if (!output || saving) return;
    setSaving(true);
    try {
      const body = {
        client_name: output.client_name ?? clientName ?? null,
        client_company: output.client_company ?? clientCompany ?? null,
        transcript,
        pain_point: output.pain_point ?? null,
        budget_signal: output.budget_signal ?? null,
        timeline: output.timeline ?? null,
        decision_maker: output.decision_maker ?? null,
        fit_score: output.fit_score ?? null,
        proposal_data: output.proposal ?? null,
        suggested_replies: output.suggested_replies ?? null,
        proposed_amount: parseAmountFromString(
          output.proposal?.investment_number
        ),
        source: "proposal_generator",
        stage: "lead" as const,
      };
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save");
      const { id } = await res.json();
      setSavedId(id);
      toast.success("Saved to pipeline");
    } catch (err) {
      console.error(err);
      toast.error("Couldn’t save to pipeline");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShellClient>
      <PageHeader
        eyebrow="Module 1 / Core Wedge"
        title="Proposal Generator"
        description="Paste a discovery call transcript. We extract the deal, score fit, and draft a proposal with reply options."
      />

      <div className="grid grid-cols-2 gap-6">
        {/* Left: input */}
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label
                htmlFor="cn"
                className="text-[11.5px] font-medium text-muted-foreground uppercase tracking-[0.1em]"
              >
                Client name
              </Label>
              <Input
                id="cn"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Optional"
                className="h-9 text-[13px]"
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="cc"
                className="text-[11.5px] font-medium text-muted-foreground uppercase tracking-[0.1em]"
              >
                Company
              </Label>
              <Input
                id="cc"
                value={clientCompany}
                onChange={(e) => setClientCompany(e.target.value)}
                placeholder="Optional"
                className="h-9 text-[13px]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="t"
              className="text-[11.5px] font-medium text-muted-foreground uppercase tracking-[0.1em]"
            >
              Discovery call transcript
            </Label>
            <Textarea
              id="t"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste raw or cleaned transcript here…"
              className="min-h-[500px] text-[13px] leading-relaxed resize-y font-mono"
            />
          </div>

          <Button
            onClick={onGenerate}
            disabled={!transcript.trim() || streaming}
            className="h-10 px-5 bg-[var(--accent-sage)] text-[var(--accent-sage-fg)] hover:bg-[var(--accent-sage)]/90 gap-2"
          >
            {streaming ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Sparkles className="size-3.5" strokeWidth={1.75} /> Generate
                proposal
              </>
            )}
          </Button>
        </div>

        {/* Right: output */}
        <div>
          {!output && !streaming && (
            <div className="h-full min-h-[400px] rounded-md border border-dashed border-border bg-card/40 flex items-center justify-center">
              <div className="text-center max-w-[280px] px-6">
                <div className="text-[13px] text-muted-foreground leading-relaxed">
                  Paste a transcript and click&nbsp;Generate. We&apos;ll
                  populate the deal summary, the proposal, and two reply drafts.
                </div>
              </div>
            </div>
          )}

          {(output || streaming) && (
            <>
              <ProposalOutput data={output ?? {}} streaming={streaming} />
              {output?.proposal && !streaming && (
                <div className="mt-5 flex items-center gap-3">
                  <Button
                    onClick={onSaveToPipeline}
                    disabled={saving || !!savedId}
                    className="h-9 gap-2 bg-foreground text-background hover:bg-foreground/90"
                  >
                    <Save className="size-3.5" strokeWidth={1.75} />
                    {savedId ? "Saved" : saving ? "Saving…" : "Save to pipeline"}
                  </Button>
                  {savedId && (
                    <button
                      type="button"
                      onClick={() => router.push(`/pipeline/${savedId}`)}
                      className="text-[12.5px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                    >
                      Open deal →
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {!output && raw && (
            <pre className="mt-4 text-[11px] text-muted-foreground overflow-x-auto">
              {raw}
            </pre>
          )}
        </div>
      </div>
    </AppShellClient>
  );
}
