"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { computeClientHealth, healthInputFromEvents } from "@/lib/client-health";
import type { ClientHealth, DealEvent, DealStage } from "@/lib/types";
import { cn } from "@/lib/utils";

const LEVEL_STYLE: Record<ClientHealth["level"], string> = {
  healthy: "bg-[var(--accent-sage)]/10 text-[var(--accent-sage)] border-[var(--accent-sage)]/25",
  cooling:
    "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900",
  at_risk: "bg-destructive/10 text-destructive border-destructive/25",
};

const LEVEL_LABEL: Record<ClientHealth["level"], string> = {
  healthy: "Healthy",
  cooling: "Cooling",
  at_risk: "At risk",
};

/**
 * Not a sentiment model — we don't run sentiment analysis on transcripts.
 * This reads engagement signals already on the deal's event feed: how long
 * since anything happened, and whether a shared proposal ever got opened.
 * Only meaningful for a deal still in play, so it hides itself once closed.
 */
export function ClientHealthCard({
  dealId,
  stage,
}: {
  dealId: string;
  stage: DealStage;
}) {
  const [health, setHealth] = useState<ClientHealth | null>(null);

  useEffect(() => {
    if (stage === "won" || stage === "lost") return;
    const supabase = createClient();
    supabase
      .from("deal_events")
      .select("*")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const events = (data as DealEvent[]) ?? [];
        setHealth(computeClientHealth(healthInputFromEvents(events)));
      });
  }, [dealId, stage]);

  if (stage === "won" || stage === "lost" || !health) return null;

  return (
    <section>
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground mb-3 font-medium">
        Client health
      </div>
      <div
        className={cn(
          "rounded-md border px-3.5 py-3 space-y-2",
          LEVEL_STYLE[health.level]
        )}
      >
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium">
            {LEVEL_LABEL[health.level]}
          </span>
          <span className="text-[11px] tabular-nums opacity-70">
            {health.score}/100
          </span>
        </div>
        <ul className="space-y-1">
          {health.reasons.map((r, i) => (
            <li key={i} className="text-[11.5px] leading-snug opacity-85">
              {r}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
