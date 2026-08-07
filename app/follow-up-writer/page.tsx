"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShellClient } from "@/components/app-shell-client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReplyCard } from "@/components/reply-card";
import { tryParsePartialJson } from "@/lib/format";
import type { Deal, SuggestedReply } from "@/lib/types";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function FollowUpWriterPage() {
  return (
    <Suspense fallback={null}>
      <FollowUpWriterInner />
    </Suspense>
  );
}

function FollowUpWriterInner() {
  const search = useSearchParams();
  const [situation, setSituation] = useState("");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealId, setDealId] = useState<string>("none");
  const [streaming, setStreaming] = useState(false);
  const [replies, setReplies] = useState<SuggestedReply[]>([]);

  useEffect(() => {
    fetch("/api/deals")
      .then((r) => r.json())
      .then((j) => {
        setDeals(j.deals ?? []);
        const fromUrl = search.get("deal");
        if (fromUrl) setDealId(fromUrl);
      });
  }, [search]);

  const onGenerate = async () => {
    if (!situation.trim() || streaming) return;
    setStreaming(true);
    setReplies([]);
    try {
      const r = await fetch("/api/followup/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          situation,
          deal_id: dealId === "none" ? null : dealId,
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
        const parsed = tryParsePartialJson<{ replies: SuggestedReply[] }>(acc);
        if (parsed?.replies) setReplies(parsed.replies);
      }
    } catch (err) {
      console.error(err);
      toast.error("Generation failed");
    } finally {
      setStreaming(false);
    }
  };

  return (
    <AppShellClient>
      <PageHeader
        eyebrow="Module 3 / Communication"
        title="Follow-up Writer"
        description="Describe the situation. Get three drafts in distinct tones, ready to copy."
      />

      <div className="max-w-[820px] space-y-6">
        <div className="space-y-2">
          <Label className="text-[11.5px] uppercase tracking-[0.1em] font-medium text-muted-foreground">
            Link to existing deal
          </Label>
          <Select value={dealId} onValueChange={setDealId}>
            <SelectTrigger className="h-9 text-[13px] w-full max-w-[440px]">
              <SelectValue placeholder="Optional — no deal context" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" className="text-[13px]">
                — No deal context —
              </SelectItem>
              {deals.map((d) => (
                <SelectItem key={d.id} value={d.id} className="text-[13px]">
                  {d.client_name ?? "Unnamed"}
                  {d.client_company ? ` · ${d.client_company}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label
            htmlFor="sit"
            className="text-[11.5px] uppercase tracking-[0.1em] font-medium text-muted-foreground"
          >
            Describe the situation
          </Label>
          <Textarea
            id="sit"
            value={situation}
            onChange={(e) => setSituation(e.target.value)}
            placeholder="Example: Sent proposal 5 days ago to Ahmed Raza at FreshLine Apparel. He went quiet but mentioned budget concern on the call. Want to nudge without seeming desperate."
            className="min-h-[200px] text-[13px] leading-relaxed"
          />
        </div>

        <Button
          onClick={onGenerate}
          disabled={!situation.trim() || streaming}
          className="h-10 px-5 bg-[var(--accent-sage)] text-[var(--accent-sage-fg)] hover:bg-[var(--accent-sage)]/90 gap-2"
        >
          {streaming ? (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Generating…
            </>
          ) : (
            <>
              <Sparkles className="size-3.5" strokeWidth={1.75} /> Generate
              follow-ups
            </>
          )}
        </Button>

        {(replies.length > 0 || streaming) && (
          <div className="space-y-3 pt-2">
            {replies.map((r, i) => (
              <ReplyCard
                key={i}
                tone={r.tone}
                subject={r.subject}
                body={r.body}
              />
            ))}
            {streaming && replies.length === 0 && (
              <div className="text-[12.5px] text-muted-foreground flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-[var(--accent-sage)] animate-pulse" />
                Writing…
              </div>
            )}
          </div>
        )}
      </div>
    </AppShellClient>
  );
}
