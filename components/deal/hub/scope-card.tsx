"use client";

import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import type { DealOverview } from "@/app/api/deals/[id]/overview/route";
import { HubCard } from "./primitives";

const SHOWN = 6;

/**
 * What was agreed, kept in view so the next "could you also..." gets checked
 * against it instead of absorbed. The check itself opens in a sheet.
 */
export function ScopeCard({
  overview,
  onCheck,
}: {
  overview: DealOverview;
  onCheck: () => void;
}) {
  const deliverables = overview.proposal?.data.deliverables.filter(Boolean) ?? [];
  const extra = deliverables.length - SHOWN;

  return (
    <HubCard
      eyebrow="Scope protection"
      icon={ShieldCheckIcon}
      title={
        deliverables.length
          ? `${deliverables.length} ${deliverables.length === 1 ? "deliverable" : "deliverables"} agreed.`
          : "Scope is set once the proposal is."
      }
    >
      {deliverables.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {deliverables.slice(0, SHOWN).map((item, i) => (
            <li
              key={i}
              title={item}
              className="max-w-full truncate rounded-md border border-border bg-background/60 px-2 py-1 text-[11.5px] text-foreground/85"
            >
              {item}
            </li>
          ))}
          {extra > 0 && (
            <li className="rounded-md px-1.5 py-1 text-[11.5px] text-muted-foreground">+{extra} more</li>
          )}
        </ul>
      ) : (
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
          The deliverables in the proposal become the line every new request is checked against.
        </p>
      )}

      <Button variant="outline" size="sm" onClick={onCheck} className="mt-4 gap-1.5">
        <ShieldCheckIcon className="size-3.5" strokeWidth={1.8} />
        Check a new request
      </Button>
    </HubCard>
  );
}
