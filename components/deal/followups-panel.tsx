"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ReplyCard } from "@/components/reply-card";
import { useStreamingJson } from "@/lib/hooks/use-streaming-json";
import type { Deal, SuggestedReply } from "@/lib/types";
import { Loader2, Sparkles } from "lucide-react";

/**
 * The standalone page made you pick a deal from a dropdown. Here the deal is
 * the surrounding context, so it's passed straight through — one fewer step,
 * and no chance of generating a follow-up against the wrong client.
 */
export function FollowUpsPanel({ deal }: { deal: Deal }) {
  const [situation, setSituation] = useState("");
  const { data, streaming, run } = useStreamingJson<{
    replies: SuggestedReply[];
  }>("/api/followup/generate");

  const replies = data?.replies ?? [];

  // Replies extracted at the discovery call, kept separate from newly
  // generated ones so the original suggestions aren't lost.
  const original = deal.suggested_replies ?? [];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label
          htmlFor="situation"
          className="text-[11.5px] uppercase tracking-[0.1em] font-medium text-muted-foreground block"
        >
          What&rsquo;s happened since?
        </label>
        <Textarea
          id="situation"
          value={situation}
          onChange={(e) => setSituation(e.target.value)}
          placeholder={`Example: Sent the proposal four days ago, ${deal.client_name ?? "they"} went quiet. Want to nudge without seeming desperate.`}
          className="min-h-[120px] text-[13px] leading-relaxed"
        />
        <p className="text-[11.5px] text-muted-foreground">
          {deal.client_name ?? "This deal"}
          {deal.client_company ? ` at ${deal.client_company}` : ""} is already
          in context — just describe the situation.
        </p>
      </div>

      <Button
        onClick={() => run({ situation, deal_id: deal.id })}
        disabled={!situation.trim() || streaming}
        className="h-9 px-4 text-[12.5px] gap-2 bg-[var(--brand)] text-[var(--brand-fg)] hover:bg-[var(--brand)]/90 cursor-pointer"
      >
        {streaming ? (
          <>
            <Loader2 className="size-3.5 animate-spin" /> Writing…
          </>
        ) : (
          <>
            <Sparkles className="size-3.5" strokeWidth={1.75} /> Generate
            follow-ups
          </>
        )}
      </Button>

      {replies.length > 0 && (
        <div className="space-y-3">
          {replies.map((reply, i) => (
            <ReplyCard
              key={i}
              tone={reply.tone}
              subject={reply.subject}
              body={reply.body}
            />
          ))}
        </div>
      )}

      {original.length > 0 && (
        <section className="pt-2">
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3 font-medium">
            From the discovery call
          </div>
          <div className="space-y-3">
            {original.map((reply, i) => (
              <ReplyCard
                key={i}
                tone={reply.tone}
                subject={reply.subject}
                body={reply.body}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
