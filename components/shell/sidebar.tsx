"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { navFor, isActive } from "./nav";
import { Wordmark } from "./wordmark";

/**
 * The left rail. Workspace at the top, the destinations below — the shape the
 * whole product is read through, so it is fixed and never scrolls away with
 * the page. Below the rail breakpoint the same list becomes the bottom bar.
 */
export function Sidebar({ email }: { email: string }) {
  const path = usePathname();
  const items = navFor(email);

  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-[var(--rail)] flex-col border-r border-sidebar-border bg-sidebar">
      <div className="h-[60px] shrink-0 flex items-center px-4">
        <Wordmark />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-3 pt-2 pb-4">
        <nav className="flex flex-col gap-0.5">
          {items.map(({ href, label, Icon }) => {
            const active = isActive(href, path);

            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] row-lift",
                  active
                    ? "bg-sidebar-accent text-foreground font-medium"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                )}
              >
                {/* The only brand mark in the rail: one bead for where you are. */}
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-full bg-brand-vivid transition-all duration-200",
                    active ? "h-4 opacity-100" : "h-0 opacity-0"
                  )}
                />
                <Icon
                  className={cn(
                    "size-4 shrink-0 transition-colors",
                    active ? "text-brand" : "text-muted-foreground/80"
                  )}
                  strokeWidth={1.6}
                />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
