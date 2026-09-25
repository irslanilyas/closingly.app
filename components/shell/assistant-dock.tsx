"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { AskOrb } from "@/components/ask/ask-orb";
import { AskPanel } from "@/components/ask/ask-panel";

const DEAL_PATH = /^\/pipeline\/([0-9a-f-]{36})/i;

/**
 * Ask Closingly, as a floating launcher and a side panel.
 *
 * Floating rather than docked in the rail: the rail is hidden on mobile, and
 * an assistant you can only reach on a wide screen is one nobody uses. It
 * knows which page it was opened from, so "this deal" means the deal on
 * screen. Ctrl or Cmd + J opens it from anywhere.
 */
export function AssistantDock() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const dealId = path.match(DEAL_PATH)?.[1] ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {/* Below the rail breakpoint it rides just above the bottom bar. On a
          proposal it steps aside there: that page has its own composer
          pinned to the same edge, and two AI inputs stacked on a phone is
          one too many. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask Closingly (Ctrl J)"
        className={cn(
          "group fixed z-30 flex items-center gap-2 rounded-full bg-card py-2 pl-2 pr-3.5 text-foreground ring-1 ring-border",
          "bottom-[calc(var(--mobile-nav-h)+12px)] right-[max(1rem,env(safe-area-inset-right))] lg:bottom-5 lg:right-5",
          // It floats over the page, so it takes the one float elevation.
          "shadow-float transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.97]",
          path.startsWith("/proposals/") && "max-lg:hidden",
          open && "pointer-events-none opacity-0"
        )}
      >
        <AskOrb size={24} />
        <span className="text-[13px] font-medium">Ask</span>
        <kbd className="ml-0.5 hidden rounded-[3.2px] border border-border px-1 font-sans text-[10.5px] text-muted-foreground lg:inline">
          Ctrl J
        </kbd>
      </button>

      <AskPanel open={open} onOpenChange={setOpen} context={{ path, dealId }} />
    </>
  );
}
