"use client";

import { Button } from "@/components/ui/button";
import { useStreamingJson } from "@/lib/hooks/use-streaming-json";
import type { PostmortemResult } from "@/lib/types";
import {
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { Spinner } from "@/components/ui/spinner";
import { RevealText } from "@/components/ui/reveal-text";

/**
 * Only ever shown on a deal marked "lost". Turns a loss into a private
 * reflection instead of letting it just disappear from the pipeline: the
 * same transcript that would have fed a proposal now feeds a diagnosis.
 */
export function PostmortemPanel({ dealId }: { dealId: string }) {
  const { data, streaming, run } = useStreamingJson<PostmortemResult>(
    `/api/deals/${dealId}/postmortem`
  );

  return (
    <div className="space-y-6">
      <p className="text-[12.5px] text-muted-foreground leading-relaxed max-w-[520px]">
        A blunt, private read on why this one didn&rsquo;t close, pulled from
        the calls and everything this deal collected. Only you see it.
      </p>

      <Button
        onClick={() => run({})}
        disabled={streaming}
        className="h-9 px-4 text-[12.5px] gap-2 cursor-pointer"
        variant="outline"
      >
        {streaming ? (
          <>
            <Spinner className="size-3.5" /> Analyzing
          </>
        ) : (
          <>
            <MagnifyingGlassIcon className="size-3.5" strokeWidth={1.75} /> Generate
            post-mortem
          </>
        )}
      </Button>

      {(data || streaming) && <Result data={data} />}
    </div>
  );
}

function Result({ data }: { data: Partial<PostmortemResult> | null }) {
  if (!data?.what_went_wrong) {
    return <p className="shimmer-text py-6 text-[13px]">Reading back through the deal for where it turned…</p>;
  }

  return (
    <div className="space-y-4">
      <Card title="What went wrong">
        <p className="text-[13px] leading-relaxed text-foreground/85">
          <RevealText text={data.what_went_wrong} />
        </p>
      </Card>

      {data.earliest_warning_sign && (
        <Card title="Earliest warning sign">
          <p className="text-[13px] leading-relaxed text-foreground/85">
            <RevealText text={data.earliest_warning_sign} />
          </p>
        </Card>
      )}

      {data.price_or_scope_factor && (
        <Card title="Price or scope factor">
          <p className="text-[13px] leading-relaxed text-foreground/85">
            <RevealText text={data.price_or_scope_factor} />
          </p>
        </Card>
      )}

      {data.what_to_try_next_time && (
        <Card title="Next time">
          <p className="text-[13px] leading-relaxed text-foreground/85">
            <RevealText text={data.what_to_try_next_time} />
          </p>
        </Card>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium mb-2.5">
        {title}
      </div>
      {children}
    </div>
  );
}
