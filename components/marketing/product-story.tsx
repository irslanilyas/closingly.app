"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { EyeIcon, VideoCameraIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";

/**
 * The product, played once in miniature: a discovery call on the left, and the
 * proposal writing itself from it on the right.
 *
 * Phrases the client says get marked as they are heard; each mark sends a
 * bead (the same bead that closes the arc in the wordmark) across into the
 * proposal, where that section writes itself. Then the proposal goes out, the
 * client reads it, and the deal moves. Every name and figure here is an
 * illustration, and the stage says so.
 *
 * Laid out at a fixed size and scaled to fit, so the choreography holds its
 * geometry at any width. Pauses when scrolled away or the tab is hidden, and
 * under reduced motion shows the finished state, still.
 */

const W = 600;
const H = 590;

interface Line {
  who: string;
  client: boolean;
  parts: Array<string | { mark: string; section: number }>;
}

const LINES: Line[] = [
  {
    who: "Sarah, Northwind",
    client: true,
    parts: ["Honestly, our mobile checkout ", { mark: "loses about 60% of people", section: 0 }, " before they pay."],
  },
  { who: "You", client: false, parts: ["What would fixing that be worth before Black Friday?"] },
  {
    who: "Sarah, Northwind",
    client: true,
    parts: ["We've set aside ", { mark: "around $8 to 12k", section: 1 }, ", and it has to be ", { mark: "live by November", section: 2 }, "."],
  },
  {
    who: "Sarah, Northwind",
    client: true,
    parts: ["If it works, I'd want to ", { mark: "redo the product pages next", section: 3 }, "."],
  },
];

const SECTIONS = [
  { label: "The challenge", value: "Mobile checkout loses 60% of buyers before payment." },
  { label: "Investment", value: "$9,500, priced from your past deals" },
  { label: "Timeline", value: "Live by November 14, in three phases" },
  { label: "Next phase", value: "Product pages, once checkout ships" },
];

/*
 * The script, as step numbers. Each entry is how long to hold before the next
 * step. Steps: 1-4 lines appear; marks and beads interleave; then the deal.
 */
type Beat =
  | { kind: "line"; line: number }
  | { kind: "mark"; section: number }
  | { kind: "bead"; section: number }
  | { kind: "shared" }
  | { kind: "read" }
  | { kind: "hold" };

const SCRIPT: Array<Beat & { hold: number }> = [
  { kind: "line", line: 0, hold: 900 },
  { kind: "mark", section: 0, hold: 650 },
  { kind: "bead", section: 0, hold: 900 },
  { kind: "line", line: 1, hold: 1000 },
  { kind: "line", line: 2, hold: 800 },
  { kind: "mark", section: 1, hold: 550 },
  { kind: "bead", section: 1, hold: 700 },
  { kind: "mark", section: 2, hold: 550 },
  { kind: "bead", section: 2, hold: 900 },
  { kind: "line", line: 3, hold: 800 },
  { kind: "mark", section: 3, hold: 550 },
  { kind: "bead", section: 3, hold: 1100 },
  { kind: "shared", hold: 1300 },
  { kind: "read", hold: 3600 },
  { kind: "hold", hold: 900 },
];

function stateAt(step: number) {
  const done = SCRIPT.slice(0, step + 1);
  return {
    lines: new Set(done.filter((b) => b.kind === "line").map((b) => (b as { line: number }).line)),
    marks: new Set(done.filter((b) => b.kind === "mark").map((b) => (b as { section: number }).section)),
    beads: new Set(done.filter((b) => b.kind === "bead").map((b) => (b as { section: number }).section)),
    shared: done.some((b) => b.kind === "shared"),
    read: done.some((b) => b.kind === "read"),
    leaving: SCRIPT[step]?.kind === "hold",
  };
}

const EASE = [0.16, 1, 0.3, 1] as const;

export function ProductStory({ className, tone = "field" }: { className?: string; tone?: "field" | "plain" }) {
  const reduce = useReducedMotion();
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [step, setStep] = useState(-1);
  const [cycle, setCycle] = useState(0);
  const [visible, setVisible] = useState(true);

  // Fit the fixed stage to whatever width it was given.
  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / W));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Only play while it can be seen.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    const onVis = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    if (reduce || !visible) return;
    const hold = step < 0 ? 500 : SCRIPT[step].hold;
    const timer = setTimeout(() => {
      if (step >= SCRIPT.length - 1) {
        setStep(-1);
        setCycle((c) => c + 1);
      } else {
        setStep((s) => s + 1);
      }
    }, hold);
    return () => clearTimeout(timer);
  }, [step, visible, reduce]);

  const s = reduce ? stateAt(SCRIPT.length - 2) : stateAt(step);
  // Shared-layout flights are measured in screen pixels; on a scaled-down
  // stage they would overshoot, so small screens get the bead without the trip.
  const fly = scale > 0.98;

  return (
    <div ref={frame} className={cn("relative w-full", className)} style={{ height: H * scale }}>
      <div
        className="absolute left-1/2 top-0 origin-top"
        style={{ width: W, height: H, transform: `translateX(-50%) scale(${scale})` }}
      >
        <LayoutGroup id={`story-${cycle}`}>
          <motion.div
            key={cycle}
            className="relative size-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: s.leaving ? 0 : 1 }}
            transition={{ duration: s.leaving ? 0.7 : 0.5, ease: EASE }}
          >
            {/* The call */}
            <div className="story-card absolute left-0 top-0 w-[388px] rounded-2xl p-4">
              <div className="flex items-center gap-2.5">
                <span className="grid size-7 place-items-center rounded-full bg-brand-soft text-brand">
                  <VideoCameraIcon className="size-3.5" strokeWidth={1.9} />
                </span>
                <div className="min-w-0">
                  <p className="text-[12.5px] font-medium leading-tight text-foreground">Discovery call, Northwind Apparel</p>
                  <p className="text-[11px] leading-tight text-muted-foreground">Closingly Notetaker is recording</p>
                </div>
                <span className="ml-auto flex h-3.5 items-end gap-[2px]" aria-hidden>
                  {[0.5, 1, 0.65, 0.85].map((h, i) => (
                    <span
                      key={i}
                      className={cn("w-[2.5px] rounded-full bg-brand", !reduce && !s.shared && "live-bar")}
                      style={{ height: `${h * 100}%`, animationDelay: `${i * 120}ms` }}
                    />
                  ))}
                </span>
              </div>

              <ol className="mt-3.5 space-y-2.5">
                {LINES.map((line, i) => (
                  <AnimatePresence key={i}>
                    {s.lines.has(i) && (
                      <motion.li
                        initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        transition={{ duration: 0.45, ease: EASE }}
                        className="text-[12.5px] leading-[1.55]"
                      >
                        <span className={cn("mr-1.5 text-[11px] font-medium", line.client ? "text-brand" : "text-muted-foreground")}>
                          {line.who}
                        </span>
                        <span className="text-foreground/85">
                          {line.parts.map((part, j) =>
                            typeof part === "string" ? (
                              <span key={j}>{part}</span>
                            ) : (
                              <span key={j} className="relative">
                                <mark className={cn("story-mark", s.marks.has(part.section) && "is-on")}>{part.mark}</mark>
                                {s.marks.has(part.section) && !s.beads.has(part.section) && (
                                  <motion.span
                                    layoutId={fly ? `bead-${part.section}` : undefined}
                                    className="absolute -right-1.5 -top-1 size-2 rounded-full bg-brand"
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: "spring", stiffness: 520, damping: 22 }}
                                  />
                                )}
                              </span>
                            )
                          )}
                        </span>
                      </motion.li>
                    )}
                  </AnimatePresence>
                ))}
              </ol>
            </div>

            {/* The proposal, writing itself */}
            <div className="story-paper absolute right-0 top-[236px] w-[336px] -rotate-[1.2deg] rounded-2xl px-5 pb-5 pt-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-display text-[18px] leading-tight tracking-[-0.015em] text-foreground">Proposal for Northwind</p>
                <AnimatePresence>
                  {s.shared && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: "spring", stiffness: 420, damping: 24 }}
                      className="rounded-full bg-brand px-2 py-0.5 text-[10.5px] font-medium text-brand-fg"
                    >
                      Sent
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Drafted from the call, two minutes after it ended</p>

              <ul className="mt-4 space-y-3">
                {SECTIONS.map((section, i) => {
                  const landed = s.beads.has(i);
                  return (
                    <li key={section.label} className="flex gap-3">
                      <span className="relative mt-[5px] grid size-2 shrink-0 place-items-center">
                        <span className="absolute size-2 rounded-full border border-border" />
                        {landed && (
                          <motion.span
                            layoutId={fly ? `bead-${i}` : undefined}
                            initial={fly ? undefined : { scale: 0 }}
                            animate={fly ? undefined : { scale: 1 }}
                            className="absolute size-2 rounded-full bg-brand"
                            transition={{ type: "spring", stiffness: 170, damping: 22, mass: 0.9 }}
                          />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-[10.5px] font-medium uppercase tracking-[0.08em] transition-colors duration-500", landed ? "text-brand" : "text-muted-foreground/70")}>
                          {section.label}
                        </p>
                        <div className="relative mt-1 min-h-[18px]">
                          {!landed && <span className="block h-[7px] w-[82%] translate-y-[5px] rounded-full bg-muted" />}
                          {landed && (
                            <motion.p
                              initial={{ clipPath: "inset(0 100% 0 0)" }}
                              animate={{ clipPath: "inset(0 0% 0 0)" }}
                              transition={{ duration: 0.7, delay: 0.35, ease: EASE }}
                              className="text-[12.5px] leading-snug text-foreground"
                            >
                              {section.value}
                            </motion.p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* The deal, moving */}
            <div className="story-card absolute bottom-[28px] left-[10px] flex w-[282px] items-center gap-3 rounded-xl px-3.5 py-3">
              <span className="grid size-8 place-items-center rounded-lg border border-border text-[11px] font-semibold text-muted-foreground">NA</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-medium leading-tight text-foreground">Northwind Apparel</p>
                <p className="text-[11.5px] tabular-nums text-muted-foreground">$9,500</p>
              </div>
              <span className="relative h-5 w-[92px] overflow-hidden text-right">
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.span
                    key={s.read ? "neg" : s.shared ? "sent" : "lead"}
                    initial={{ y: 14, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -14, opacity: 0 }}
                    transition={{ duration: 0.4, ease: EASE }}
                    className={cn(
                      "absolute right-0 top-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium",
                      s.shared ? "bg-brand text-brand-fg" : "bg-secondary text-secondary-foreground"
                    )}
                  >
                    {s.read ? "Negotiating" : s.shared ? "Proposal sent" : "Lead"}
                  </motion.span>
                </AnimatePresence>
              </span>
            </div>

            {/* The signal nobody else gets */}
            <AnimatePresence>
              {s.read && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 26 }}
                  className="story-card absolute right-[10px] top-[168px] z-10 flex w-[272px] items-start gap-2.5 rounded-xl px-3.5 py-3"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand text-brand-fg">
                    <EyeIcon className="size-3.5" strokeWidth={2} />
                  </span>
                  <p className="text-[12px] leading-snug text-foreground">
                    <span className="font-medium">Sarah opened the proposal.</span>{" "}
                    <span className="text-muted-foreground">She read Investment twice.</span>
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </LayoutGroup>
      </div>
      {tone === "field" && <span className="sr-only">An illustrated example: a discovery call becoming a drafted, tracked proposal.</span>}
    </div>
  );
}
