"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { FileUp, Loader2 } from "lucide-react";

/** Mirrors the server's floor so the button disables before a wasted round trip. */
const MIN_CHARS = 200;

/**
 * Bring in a call the agent didn't record — a transcript from Otter,
 * Fireflies, Zoom, or a call that happened before the user signed up.
 *
 * This is the same door the meeting bot uses, not a side channel: the paste
 * goes through the identical transcript → triage → deal → draft-proposal
 * pipeline. It also solves the cold start, which is the real reason it
 * exists — a new user with no calls booked this week can still get a deal
 * into their pipeline on day one.
 *
 * Audio upload belongs here too, but Recall can only transcribe what its own
 * bot or desktop SDK captured — it cannot take an uploaded file — so that
 * needs a separate transcription vendor and is deliberately not built yet.
 * The async shape above (enqueue, show Processing, fill in later) is already
 * the right shape for it when it lands.
 */
export function ImportCallDialog({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const chars = transcript.trim().length;
  const tooShort = chars > 0 && chars < MIN_CHARS;

  const reset = () => {
    setTitle("");
    setTranscript("");
  };

  const submit = async () => {
    if (chars < MIN_CHARS || submitting) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/meetings/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: transcript.trim(), title }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        const messages: Record<string, string> = {
          transcript_too_short: `Needs at least ${MIN_CHARS} characters to be worth reading.`,
          transcript_too_long: "That's larger than a transcript should be.",
          rate_limited: "That's a lot of imports at once — try again shortly.",
        };
        throw new Error(messages[body.error] ?? "Couldn't import that call.");
      }

      toast.success(
        "Reading the transcript — the deal appears here in about a minute."
      );
      reset();
      setOpen(false);
      onImported();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't import that call."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="h-9 text-[12.5px] gap-2 cursor-pointer"
        >
          <FileUp className="size-3.5" strokeWidth={1.5} />
          Import a call
        </Button>
      </DialogTrigger>

      {/* Capped and scrollable: a pasted transcript grows the body past the
          viewport, and without this the footer button lands off-screen with
          no way to reach it. */}
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import a call</DialogTitle>
          <DialogDescription>
            Paste a transcript from Otter, Fireflies, Zoom — or any call the
            agent wasn&rsquo;t on. It goes through exactly the same read as a
            recorded call: if it&rsquo;s a discovery conversation, you get a
            deal and a drafted proposal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1 flex-1 overflow-y-auto min-h-0 -mx-1 px-1">
          <div className="space-y-2">
            <label
              htmlFor="import-title"
              className="text-[11.5px] uppercase tracking-[0.1em] font-medium text-muted-foreground"
            >
              What was this call? <span className="normal-case tracking-normal text-muted-foreground/70">(optional)</span>
            </label>
            <Input
              id="import-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Discovery call with Acme"
              className="h-9 text-[13px]"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="import-transcript"
                className="text-[11.5px] uppercase tracking-[0.1em] font-medium text-muted-foreground"
              >
                Transcript
              </label>
              {chars > 0 && (
                <span
                  className={`text-[11px] tabular-nums ${
                    tooShort ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                  }`}
                >
                  {tooShort
                    ? `${MIN_CHARS - chars} more characters needed`
                    : `${chars.toLocaleString()} characters`}
                </span>
              )}
            </div>
            <Textarea
              id="import-transcript"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder={
                "Speaker 1: Thanks for making time today…\nSpeaker 2: Of course. So the problem we're running into is…"
              }
              className="min-h-[180px] max-h-[40vh] text-[12.5px] leading-relaxed font-mono"
            />
            <p className="text-[11.5px] text-muted-foreground leading-relaxed">
              Speaker labels help but aren&rsquo;t required — paste it as it
              comes out of the other tool.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={submit}
            disabled={chars < MIN_CHARS || submitting}
            className="bg-[var(--brand)] text-[var(--brand-fg)] hover:bg-[var(--brand)]/90 cursor-pointer gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Importing…
              </>
            ) : (
              "Import call"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
