"use client";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { useStreamingJson } from "@/lib/hooks/use-streaming-json";
import type { CaseStudyResult } from "@/lib/types";
import {
  TrophyIcon,
} from "@heroicons/react/24/outline";
import { Spinner } from "@/components/ui/spinner";
import { RevealText } from "@/components/ui/reveal-text";

/**
 * Only ever shown on a deal marked "won". Turns the same transcript that fed
 * the proposal into marketing material: real language from the call, not
 * invented praise.
 */
export function CaseStudyPanel({ dealId }: { dealId: string }) {
  const { data, streaming, run } = useStreamingJson<CaseStudyResult>(
    `/api/deals/${dealId}/case-study`
  );

  return (
    <div className="space-y-6">
      <p className="text-[12.5px] text-muted-foreground leading-relaxed max-w-[520px]">
        Drafts a case study and a testimonial request from this deal&rsquo;s
        calls. The quote comes from the transcript, not invention, but read it
        before you send anything.
      </p>

      <Button
        onClick={() => run({})}
        disabled={streaming}
        variant="brand"
        className="h-9 gap-2 px-4 text-[12.5px]"
      >
        {streaming ? (
          <>
            <Spinner className="size-3.5" /> Drafting
          </>
        ) : (
          <>
            <TrophyIcon className="size-3.5" strokeWidth={1.75} /> Generate case
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
    return <p className="shimmer-text py-6 text-[13px]">Going back through the calls for what actually changed…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium mb-2">
          Headline
        </div>
        <div className="text-[18px] font-medium tracking-[-0.03em] leading-snug">
          <RevealText text={data.headline} />
        </div>
      </div>

      {data.summary && (
        <Card title="Summary">
          <p className="text-[13px] leading-relaxed text-foreground/85">
            <RevealText text={data.summary} />
          </p>
        </Card>
      )}

      {data.client_quote && (
        <Card title="Client quote">
          <p className="text-[13.5px] leading-relaxed italic text-foreground/85">
            <RevealText text={`“${data.client_quote}”`} />
          </p>
        </Card>
      )}

      {data.results && data.results.length > 0 && (
        <Card title="Results">
          <ul className="space-y-1.5">
            {data.results.map((r, i) => (
              <li key={i} className="text-[13px] leading-relaxed flex gap-2.5">
                <span className="mt-[9px] size-1 shrink-0 rounded-full bg-brand" />
                <RevealText text={r} />
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
          <p className="text-[13px] leading-relaxed text-foreground/85">
            <RevealText text={data.testimonial_request_email.body} />
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
    <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
          {title}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
