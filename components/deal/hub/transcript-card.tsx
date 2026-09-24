"use client";

import Link from "next/link";
import { format } from "date-fns";
import { ChatBubbleBottomCenterTextIcon, DocumentTextIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import type { DealOverview } from "@/app/api/deals/[id]/overview/route";
import { HubCard } from "./primitives";

function timestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The client's own words, one line of them. Reading what they actually said
 * is the fastest way back into a deal after a week away from it.
 */
export function TranscriptCard({
  overview,
  onOpen,
}: {
  overview: DealOverview;
  onOpen: () => void;
}) {
  const { meeting, deal } = overview;
  const hasTranscript = !!meeting || !!deal.transcript;

  if (!hasTranscript) {
    return (
      <HubCard eyebrow="Latest from the call" icon={ChatBubbleBottomCenterTextIcon} title="No call on this deal yet.">
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
          Record the next call or import a transcript, and the proposal, price and follow-ups get written from it.
        </p>
        <Button variant="outline" size="sm" asChild className="mt-4">
          <Link href="/meetings">Go to calls</Link>
        </Button>
      </HubCard>
    );
  }

  const quote = meeting?.quote;
  const when = meeting?.starts_at ? format(new Date(meeting.starts_at), "MMM d") : null;

  return (
    <HubCard
      eyebrow="Latest from the call"
      icon={ChatBubbleBottomCenterTextIcon}
      title={meeting?.title ?? (when ? `Call on ${when}` : "Imported transcript")}
    >
      {quote ? (
        <figure className="mt-3">
          <blockquote className="border-l-2 border-brand/50 pl-3.5 text-[13.5px] leading-relaxed text-foreground/90">
            &ldquo;{quote.text}&rdquo;
          </blockquote>
          <figcaption className="mt-2 pl-3.5 text-[11.5px] text-muted-foreground">
            {quote.speaker} at {timestamp(quote.start)}
            {when && ` · ${when}`}
          </figcaption>
        </figure>
      ) : (
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
          The full conversation is here whenever you need the exact wording.
        </p>
      )}

      <Button variant="outline" size="sm" onClick={onOpen} className="mt-4 gap-1.5">
        <DocumentTextIcon className="size-3.5" strokeWidth={1.8} />
        Open transcript
      </Button>
    </HubCard>
  );
}
