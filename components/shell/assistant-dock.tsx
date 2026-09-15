"use client";

import { useEffect, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";
import { Sparkles, ArrowUp, Loader2 } from "lucide-react";

interface Turn {
  question: string;
  answer: string;
  /** Still streaming. The composer stays disabled until it settles. */
  pending: boolean;
}

/**
 * Ask Closingly, as a floating bubble.
 *
 * Answers come from the person's own calls, deals and proposals. The whole
 * point is that it knows things a general assistant cannot, so it is wired to
 * refuse rather than guess when the workspace does not contain the answer.
 *
 * Deliberately not a threaded chat. Each question is answered against a fresh
 * retrieval over the workspace, and pretending to hold a conversation would
 * imply a memory of the previous turn that the retrieval does not have.
 */

const SUGGESTIONS = [
  "Which deals have gone quiet?",
  "What is actually in my pipeline right now?",
  "What did we agree on the last call?",
  "Which proposals have not been opened?",
];

export function AssistantDock() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      const id = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns]);

  const ask = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    setQuestion("");
    setBusy(true);
    setTurns((current) => [
      ...current,
      { question: trimmed, answer: "", pending: true },
    ]);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });

      if (!res.ok || !res.body) {
        throw new Error(
          res.status === 429
            ? "That's a lot of questions at once. Give it a minute."
            : "Couldn't reach the assistant."
        );
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      // Appended chunk by chunk rather than buffered, so the answer arrives
      // the way it is written.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setTurns((current) => {
          const next = [...current];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, answer: last.answer + chunk };
          return next;
        });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Couldn't reach the assistant.";
      setTurns((current) => {
        const next = [...current];
        next[next.length - 1] = {
          ...next[next.length - 1],
          answer: message,
        };
        return next;
      });
    } finally {
      setTurns((current) => {
        const next = [...current];
        const last = next[next.length - 1];
        if (last) next[next.length - 1] = { ...last, pending: false };
        return next;
      });
      setBusy(false);
    }
  };

  return (
    <>
      {/* Floating rather than docked in the rail: the rail is hidden on
          mobile entirely, and an assistant you can only reach on a wide
          screen is an assistant nobody uses. Sits under the search modal in
          the stack so it never covers a dialog. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask Closingly"
        className={cn(
          "group fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-brand py-2.5 pl-3 pr-3.5 text-brand-fg",
          "shadow-[0_2px_6px_oklch(0.215_0.012_90/0.18),0_10px_28px_-8px_oklch(0.215_0.012_90/0.32)]",
          "transition-transform duration-200 hover:-translate-y-0.5",
          open && "pointer-events-none opacity-0"
        )}
      >
        <Sparkles className="size-4 shrink-0" strokeWidth={1.8} />
        <span className="text-[13px] font-medium tracking-tight">Ask</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full sm:w-[440px] sm:max-w-[440px] flex flex-col p-0"
        >
          <SheetHeader className="gap-1.5 border-b border-border px-5 py-4">
            <SheetTitle className="text-left text-[14px] leading-none tracking-tight">
              Ask Closingly
            </SheetTitle>
            <SheetDescription className="max-w-[42ch] text-left text-[12px] leading-relaxed">
              Answered from your own calls, deals and proposals. It will tell you
              when it doesn&rsquo;t have something rather than guess.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-5 py-5">
            {turns.length === 0 ? (
              <div>
                <p className="text-[12.5px] text-muted-foreground leading-relaxed">
                  Ask anything about your own pipeline.
                </p>
                <div className="mt-3 space-y-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => ask(s)}
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-left text-[12.5px] leading-relaxed row-lift hover:border-brand/40"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {turns.map((turn, i) => (
                  <div key={i}>
                    <p className="text-[13px] font-medium tracking-tight leading-snug">
                      {turn.question}
                    </p>
                    <div className="mt-2 flex items-start gap-2">
                      <div
                        className={cn(
                          "min-w-0 flex-1 text-[13px] leading-relaxed whitespace-pre-wrap text-foreground/90",
                          turn.pending && !turn.answer && "text-muted-foreground"
                        )}
                      >
                        {turn.answer ||
                          (turn.pending ? "Reading your workspace…" : "")}
                      </div>
                      {!turn.pending && turn.answer && (
                        <CopyButton text={turn.answer} />
                      )}
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
            )}
          </div>

          <div className="border-t border-border p-4">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask(question);
                  }
                }}
                rows={2}
                maxLength={500}
                placeholder="Ask about a client, a number, or what to do next"
                className="flex-1 resize-none rounded-lg border border-input bg-card px-3 py-2 text-[13px] leading-relaxed outline-none focus-visible:border-brand"
              />
              <Button
                variant="brand"
                size="icon"
                onClick={() => ask(question)}
                disabled={busy || question.trim().length < 3}
                aria-label="Ask"
              >
                {busy ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <ArrowUp strokeWidth={2} />
                )}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
