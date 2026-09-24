"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Icon } from "@/lib/icon";
import { cn } from "@/lib/utils";

/**
 * The deal page's surfaces.
 *
 * One card shape everywhere: a small uppercase eyebrow saying what kind of
 * thing this is, a sentence-case title saying what is true about it right now,
 * and an optional action in the corner. The title is the point; the eyebrow is
 * the filing label.
 */
export function HubCard({
  id,
  eyebrow,
  icon: EyebrowIcon,
  title,
  action,
  children,
  className,
  tone = "default",
}: {
  id?: string;
  eyebrow: string;
  icon?: Icon;
  title?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  tone?: "default" | "accent";
}) {
  return (
    <section
      id={id}
      className={cn(
        "panel scroll-mt-24 p-4 sm:p-5",
        tone === "accent" &&
          "border-brand/25 bg-[color-mix(in_oklch,var(--card),var(--brand-soft)_55%)]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.13em] text-muted-foreground">
            {EyebrowIcon && <EyebrowIcon className="size-3.5" strokeWidth={1.7} />}
            {eyebrow}
          </div>
          {title && (
            <h2 className="mt-2 text-[16px] font-medium leading-snug tracking-tight text-balance">
              {title}
            </h2>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** A tool opened from the page without leaving it: pricing, scope, the transcript. */
export function ToolSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        // The primitive caps right sheets at 3/4 width and 384px through
        // attribute selectors, which out-rank a plain width utility.
        className="flex flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:w-[560px] data-[side=right]:sm:max-w-[560px]"
      >
        <SheetHeader className="gap-1.5 border-b border-border py-4 pl-5 pr-14 pt-[max(1rem,env(safe-area-inset-top))]">
          <SheetTitle className="text-left text-[15px] tracking-tight">{title}</SheetTitle>
          {description && (
            <SheetDescription className="max-w-[46ch] text-left text-[12.5px] leading-relaxed">
              {description}
            </SheetDescription>
          )}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Cards arrive in reading order: a short rise, staggered, so the page settles
 * into place instead of snapping. Skipped entirely for reduced motion.
 */
export function Reveal({
  index = 0,
  children,
  className,
}: {
  index?: number;
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.42, delay: Math.min(index * 0.05, 0.4), ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
