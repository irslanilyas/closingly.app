"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Ask Closingly's mark: three proposal sheets, fanned.
 *
 * At rest the stack floats. While the agent works, the sheets shuffle, the
 * back one coming to the front in turn, the way papers get reordered on a
 * desk mid-thought. When a change lands, the front sheet takes a check. The
 * shapes carry the product (a proposal, drafted) and the motion carries the
 * state, so the mark doubles as the "thinking" indicator.
 */

export type MarkState = "idle" | "thinking" | "done";

// Back, middle, front. Units are fractions of the mark's size.
const SLOTS = [
  { x: -0.15, y: 0.07, rotate: -11, scale: 0.88, opacity: 0.32, z: 1 },
  { x: -0.05, y: 0.025, rotate: -4, scale: 0.94, opacity: 0.6, z: 2 },
  { x: 0.07, y: -0.02, rotate: 5, scale: 1, opacity: 1, z: 3 },
] as const;

export function AskMark({
  size = 28,
  state = "idle",
  className,
}: {
  size?: number;
  state?: MarkState;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [turn, setTurn] = useState(0);

  useEffect(() => {
    if (state !== "thinking" || reduce) return;
    const timer = setInterval(() => setTurn((t) => t + 1), 620);
    return () => clearInterval(timer);
  }, [state, reduce]);

  const w = size * 0.56;
  const h = size * 0.7;

  return (
    <motion.span
      aria-hidden
      className={cn("relative inline-block shrink-0", className)}
      style={{ width: size, height: size }}
      animate={state === "idle" && !reduce ? { y: [0, -size * 0.04, 0] } : { y: 0 }}
      transition={state === "idle" ? { duration: 4.2, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
    >
      {[0, 1, 2].map((sheet) => {
        const slot = SLOTS[(sheet + turn) % 3];
        const front = slot.z === 3;
        return (
          <motion.span
            key={sheet}
            className="absolute left-1/2 top-1/2 rounded-[22%] bg-brand"
            style={{
              width: w,
              height: h,
              marginLeft: -w / 2,
              marginTop: -h / 2,
              zIndex: slot.z,
              boxShadow: front ? "0 1px 2px oklch(0.215 0.012 90 / 0.18)" : undefined,
            }}
            initial={false}
            animate={{
              x: slot.x * size,
              y: slot.y * size,
              rotate: slot.rotate,
              scale: slot.scale,
              opacity: slot.opacity,
            }}
            transition={{ type: "spring", stiffness: 380, damping: 30, mass: 0.7 }}
          >
            {/* Two lines of "text" on whichever sheet is in front. */}
            <motion.span
              className="absolute inset-x-[22%] top-[26%] flex flex-col gap-[14%]"
              style={{ height: "30%" }}
              initial={false}
              animate={{ opacity: front && state !== "done" ? 0.85 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <span className="h-[34%] rounded-full bg-brand-fg" />
              <span className="h-[34%] w-[62%] rounded-full bg-brand-fg" />
            </motion.span>
          </motion.span>
        );
      })}

      {state === "done" && (
        <motion.svg
          viewBox="0 0 24 24"
          className="absolute z-10 text-brand-fg"
          style={{ width: size * 0.34, height: size * 0.34, left: "50%", top: "50%", marginLeft: -size * 0.12, marginTop: -size * 0.2 }}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 520, damping: 24 }}
        >
          <motion.path
            d="M5 12.5l4.2 4.2L19 7"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
          />
        </motion.svg>
      )}
    </motion.span>
  );
}
