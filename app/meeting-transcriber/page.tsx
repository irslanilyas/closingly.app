"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShellClient } from "@/components/app-shell-client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton } from "@/components/copy-button";
import { Loader2, Sparkles, ArrowRight, Info } from "lucide-react";
import { toast } from "sonner";

export default function TranscriberPage() {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [cleaned, setCleaned] = useState("");

  const onClean = async () => {
    if (!raw.trim() || streaming) return;
    setStreaming(true);
    setCleaned("");
    try {
      const r = await fetch("/api/transcript/clean", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      });
      if (!r.ok || !r.body) throw new Error();
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setCleaned(acc);
      }
    } catch (err) {
      console.error(err);
      toast.error("Cleanup failed");
    } finally {
      setStreaming(false);
    }
  };

  const onSendToProposal = () => {
    if (!cleaned) return;
    sessionStorage.setItem("cleaned_transcript", cleaned);
    router.push("/proposal-generator?from=transcriber");
  };

  return (
    <AppShellClient>
      <PageHeader
        eyebrow="Module 6 / Capture"
        title="Meeting Transcriber"
        description="Paste a messy auto-transcript. Get clean, sectioned notes back."
      />

      <div className="rounded-md border border-border bg-secondary/40 px-4 py-3 mb-6 flex items-start gap-3">
        <Info className="size-3.5 text-muted-foreground mt-0.5 shrink-0" strokeWidth={1.75} />
        <div className="text-[12.5px] text-muted-foreground leading-relaxed">
          Audio transcription is coming soon. For now, paste raw transcript text
          from Otter, Fireflies, Zoom auto-transcribe, etc.
        </div>
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label
            htmlFor="raw"
            className="text-[11.5px] uppercase tracking-[0.1em] font-medium text-muted-foreground"
          >
            Raw transcript
          </Label>
          <Textarea
            id="raw"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Paste output from Otter, Fireflies, Zoom auto-transcribe, etc."
            className="min-h-[400px] text-[13px] leading-relaxed font-mono"
          />
        </div>

        <Button
          onClick={onClean}
          disabled={!raw.trim() || streaming}
          className="h-10 px-5 bg-[var(--accent-sage)] text-[var(--accent-sage-fg)] hover:bg-[var(--accent-sage)]/90 gap-2"
        >
          {streaming ? (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Cleaning…
            </>
          ) : (
            <>
              <Sparkles className="size-3.5" strokeWidth={1.75} /> Clean up
              transcript
            </>
          )}
        </Button>

        {(cleaned || streaming) && (
          <div className="rounded-md border border-border bg-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                Cleaned transcript
              </div>
              {cleaned && <CopyButton text={cleaned} />}
            </div>
            <pre className="text-[13px] leading-relaxed whitespace-pre-wrap font-sans text-foreground/85">
              {cleaned}
              {streaming && (
                <span className="inline-block size-2 ml-0.5 bg-foreground/40 animate-pulse" />
              )}
            </pre>
            {cleaned && !streaming && (
              <div className="mt-5 pt-5 border-t border-border">
                <Button
                  onClick={onSendToProposal}
                  variant="ghost"
                  className="h-9 text-[13px] gap-2 -ml-2"
                >
                  Send to Proposal Generator
                  <ArrowRight className="size-3.5" strokeWidth={1.75} />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShellClient>
  );
}
