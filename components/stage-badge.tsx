import { STAGE_LABELS, type DealStage } from "@/lib/types";
import { cn } from "@/lib/utils";

const TONE: Record<DealStage, string> = {
  lead: "bg-secondary text-foreground/70 border-border",
  proposal_sent: "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900",
  negotiating: "bg-sky-50 text-sky-900 border-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:border-sky-900",
  won: "bg-[var(--brand)]/12 text-[var(--brand)] border-[var(--brand)]/25",
  lost: "bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-900",
};

export function StageBadge({ stage }: { stage: DealStage }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] uppercase tracking-[0.1em] font-medium border",
        TONE[stage]
      )}
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}
