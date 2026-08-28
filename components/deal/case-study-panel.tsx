"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyButton } from "@/components/copy-button";
import { useStreamingJson } from "@/lib/hooks/use-streaming-json";
import type { CaseStudyResult } from "@/lib/types";
import { Loader2, Award } from "lucide-react";

/**
 * Only ever shown on a deal marked "won". Turns the same transcript that fed
 * the proposal into marketing material — real language from the call, not
 * invented praise.
 */
export function CaseStudyPanel({ dealId }: { dealId: string }) {
  const { data, streaming, run } = useStreamingJson<CaseStudyResult>(
    `/api/deals/${dealId}/case-study`
  );

  return (
    <div className="space-y-6">
      <p className="text-[12.5px] text-muted-foreground leading-relaxed max-w-[520px]">
        Drafts a case study and a testimonial-request email from this deal
        &rsquo;s discovery call. Review before you send anything — the quote
        is grounded in the transcript, not invented, but it&rsquo;s still a
        draft.
      </p>

      <Button
        onClick={() => run({})}
        disabled={streaming}
        className="h-9 px-4 text-[12.5px] gap-2 bg-[var(--accent-sage)] text-[var(--accent-sage-fg)] hover:bg-[var(--accent-sage)]/90 cursor-pointer"
      >
        {streaming ? (
          <>
            <Loader2 className="size-3.5 animate-spin" /> Drafting…
          </>
        ) : (
          <>
            <Award className="size-3.5" strokeWidth={1.75} /> Generate case
            study
          </>
        )}
      </Button>

      {(data || streaming) && <Result data={data} />}
    </div>
  );
}

function Result({ data }: { data: Partial<CaseStudyResult> | null }) {
  if (!data?.headline) {
    return <Skeleton className="h-[260px] w-full rounded-md" />;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium mb-2">
          Headline
        </div>
        <div className="text-[18px] font-medium tracking-tight leading-snug">
          {data.headline}
        </div>
      </div>

      {data.summary && (
        <Card title="Summary">
          <p className="text-[13px] leading-relaxed text-foreground/85">
            {data.summary}
          </p>
        </Card>
      )}

      {data.client_quote && (
        <Card title="Client quote">
          <p className="text-[13.5px] leading-relaxed italic text-foreground/85">
            &ldquo;{data.client_quote}&rdquo;
          </p>
        </Card>
      )}

      {data.results && data.results.length > 0 && (
        <Card title="Results">
          <ul className="space-y-1.5">
            {data.results.map((r, i) => (
              <li key={i} className="text-[13px] leading-relaxed flex gap-2.5">
                <span className="text-[var(--accent-sage)]">—</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data.testimonial_request_email?.body && (
        <Card
          title="Testimonial request email"
          action={
            <CopyButton
              text={`Subject: ${data.testimonial_request_email.subject ?? ""}\n\n${data.testimonial_request_email.body}`}
            />
          }
        >
          {data.testimonial_request_email.subject && (
            <div className="text-[12.5px] font-medium mb-2">
              {data.testimonial_request_email.subject}
            </div>
          )}
          <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-foreground/85">
            {data.testimonial_request_email.body}
          </p>
        </Card>
      )}
    </div>
  );
}

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
          {title}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
