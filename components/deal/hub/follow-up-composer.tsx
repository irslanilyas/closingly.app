"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CheckIcon,
  PaperAirplaneIcon,
  Square2StackIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { RevealText } from "@/components/ui/reveal-text";
import type { DealOverview } from "@/app/api/deals/[id]/overview/route";

type FollowUp = NonNullable<DealOverview["follow_up"]>;

/**
 * The follow-up, written, reviewed and sent without leaving the deal.
 *
 * A draft that has just been written arrives as text developing into place,
 * then becomes an ordinary editor: the point of watching it land is to read
 * it, and the point of the editor is to change it. Edits are saved as you go,
 * so closing the sheet never loses a word.
 */
export function FollowUpComposer({
  followUp,
  drafting,
  clientEmail,
  onDone,
}: {
  followUp: FollowUp | null;
  /** True while Claude is still writing the draft. */
  drafting: boolean;
  clientEmail: string | null;
  onDone: () => void;
}) {
  const [to, setTo] = useState(clientEmail ?? "");
  const [subject, setSubject] = useState(followUp?.draft_subject ?? "");
  const [body, setBody] = useState(followUp?.draft_body ?? "");
  const [sending, setSending] = useState(false);
  // Shown as developing text for a moment after arriving, then editable.
  const [revealing, setRevealing] = useState(false);
  const seenDraft = useRef(followUp?.draft_body ?? null);

  // A draft that arrives while the sheet is open replaces the empty fields
  // and plays in. One that was already there when it opened just shows.
  useEffect(() => {
    const incoming = followUp?.draft_body ?? null;
    if (!incoming || incoming === seenDraft.current) return;
    seenDraft.current = incoming;
    setSubject(followUp?.draft_subject ?? "");
    setBody(incoming);
    setRevealing(true);
    const timer = setTimeout(() => setRevealing(false), 1600);
    return () => clearTimeout(timer);
  }, [followUp?.draft_body, followUp?.draft_subject]);

  const saveDraft = () => {
    if (!followUp || !body.trim()) return;
    if (body === followUp.draft_body && subject === followUp.draft_subject) return;
    fetch(`/api/follow-ups/${followUp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_draft", draft_subject: subject, draft_body: body }),
    }).catch(() => {});
  };

  const send = async () => {
    if (!followUp) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) {
      toast.error("Add the client's email address first.");
      return;
    }
    setSending(true);
    const res = await fetch(`/api/follow-ups/${followUp.id}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: to.trim(), subject: subject.trim(), body: body.trim() }),
    }).catch(() => null);
    setSending(false);

    if (!res?.ok) {
      const detail = (await res?.json().catch(() => null)) as { error?: string; message?: string } | null;
      toast.error(
        res?.status === 401
          ? "Google needs reconnecting before this can send. Do that in Settings, or copy the message."
          : detail?.message ?? "Couldn't send that. Copy it and send it yourself."
      );
      return;
    }
    toast.success("Sent from your Gmail.");
    onDone();
  };

  const markDone = async () => {
    if (!followUp) return;
    const res = await fetch(`/api/follow-ups/${followUp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "done" }),
    }).catch(() => null);
    if (!res?.ok) {
      toast.error("Couldn't update that.");
      return;
    }
    toast.success("Marked as done.");
    onDone();
  };

  const copy = async () => {
    await navigator.clipboard.writeText(`${subject}\n\n${body}`);
    toast.success("Copied. Mark it done once it's sent.");
  };

  if (drafting && !body) {
    return (
      <div className="py-10 text-center">
        <p className="shimmer-text text-[13.5px]">Writing it from the call and the proposal…</p>
        <p className="mt-2 text-[12px] text-muted-foreground">Usually a few seconds.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {followUp?.reason && (
        <p className="rounded-lg bg-secondary px-3 py-2.5 text-[12.5px] leading-relaxed text-secondary-foreground">
          {followUp.reason}
        </p>
      )}

      <label className="block">
        <span className="mb-1.5 block text-[11.5px] font-medium text-muted-foreground">To</span>
        <Input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="client@company.com"
          className="h-9 text-[13px]"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[11.5px] font-medium text-muted-foreground">Subject</span>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          onBlur={saveDraft}
          maxLength={300}
          className="h-9 text-[13px]"
        />
      </label>

      <div>
        <span className="mb-1.5 block text-[11.5px] font-medium text-muted-foreground">Message</span>
        {revealing ? (
          <button
            type="button"
            onClick={() => setRevealing(false)}
            className="block min-h-[240px] w-full rounded-lg border border-input bg-card px-3 py-2.5 text-left text-[13px] leading-relaxed"
          >
            <RevealText text={body} ripple />
          </button>
        ) : (
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={saveDraft}
            maxLength={20_000}
            className="min-h-[240px] text-[13px] leading-relaxed"
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          variant="brand"
          onClick={send}
          disabled={sending || !body.trim() || !subject.trim()}
          className="gap-1.5"
        >
          {sending ? <Spinner className="size-3.5" /> : <PaperAirplaneIcon className="size-3.5" strokeWidth={1.9} />}
          Send from Gmail
        </Button>
        <Button variant="outline" onClick={copy} disabled={!body.trim()} className="gap-1.5">
          <Square2StackIcon className="size-3.5" strokeWidth={1.8} />
          Copy
        </Button>
        <Button variant="ghost" onClick={markDone} className="gap-1.5 text-muted-foreground sm:ml-auto">
          <CheckIcon className="size-3.5" strokeWidth={2} />
          Mark as done
        </Button>
      </div>
    </div>
  );
}
