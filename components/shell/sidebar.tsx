"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { navFor, isActive, type NavItem } from "./nav";
import { Wordmark } from "./wordmark";

/**
 * The list of destinations. Shared by the desktop rail and the mobile sheet so
 * the two can never drift out of agreement about what the app contains.
 */
export function NavList({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const path = usePathname();

  return (
    <nav className="flex flex-col gap-0.5">
      {items.map(({ href, label, Icon }) => {
        const active = isActive(href, path);

        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] row-lift",
              active
                ? "bg-sidebar-accent text-foreground font-medium"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
            )}
          >
            {/* The only persimmon in the rail: one mark for where you are. */}
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
  );
}

/**
 * The left rail. Workspace at the top, the destinations in the middle, the
 * assistant docked at the base — the shape the whole product is read through,
 * so it is fixed and never scrolls away with the page.
 */
export function Sidebar({ email }: { email: string }) {
  const items = navFor(email);

  return (
    <aside
      className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-[var(--rail)] flex-col border-r border-sidebar-border bg-sidebar"
    >
      <div className="h-[60px] shrink-0 flex items-center px-4">
        <Wordmark />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-3 pt-2 pb-4">
        <NavList items={items} />
      </div>
    </aside>
  );
}
