"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * How written-by-Claude text appears.
 *
 * Not a typewriter. Each word surfaces out of a soft blur as it arrives, so a
 * streamed answer reads like it is developing rather than being typed out one
 * character at a time. Text that arrives in one piece (a finished draft) is
 * given a short ripple across its words instead of appearing all at once.
 *
 * Words keep stable keys by position, so as a stream grows only the new words
 * mount and animate; everything already on screen stays still. Under reduced
 * motion the animation is removed in CSS and the text simply appears.
 */
export function RevealText({
  text,
  className,
  /** Stagger the words present on first render, for text that arrives whole. */
  ripple = false,
}: {
  text: string;
  className?: string;
  ripple?: boolean;
}) {
  const tokens = useMemo(() => text.split(/(\s+)/), [text]);
  // Tokens present on first render: only these ripple. Later ones are
  // streaming in and should appear the moment they arrive.
  const [initialCount] = useState(tokens.length);

  return (
    <span className={cn("whitespace-pre-wrap", className)}>
      {tokens.map((token, i) =>
        /^\s+$/.test(token) || token === "" ? (
          token
        ) : (
          <span
            key={i}
            className="reveal-word"
            style={
              ripple && i < initialCount
                ? { animationDelay: `${Math.min(i * 9, 700)}ms` }
                : undefined
            }
          >
            {token}
          </span>
        )
      )}
    </span>
  );
}
