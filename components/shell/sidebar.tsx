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
                  "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] row-lift",
                  active
                    ? "bg-sidebar-accent text-foreground font-medium"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                )}
              >
                {/* Where you are is the row and its icon, nothing else. */}
                <Icon
                  className={cn(
                    "size-4 shrink-0 transition-colors",
                    active ? "text-sidebar-primary" : "text-muted-foreground/80"
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
