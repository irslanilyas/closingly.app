"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { navFor, isActive } from "./nav";

/**
 * The rail, turned into a thumb bar for phones and tablets.
 *
 * Same destinations in the same order as the desktop rail, so moving between a
 * laptop and a phone never means relearning where anything lives. The mark for
 * where you are is the rail's own blue bead, turned horizontal and set on the
 * bar's top edge.
 */
export function MobileNav({ email }: { email: string }) {
  const path = usePathname();
  const items = navFor(email).filter((item) => item.bar);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto grid h-[58px] max-w-[600px] grid-cols-5">
        {items.map(({ href, label, Icon }) => {
          const active = isActive(href, path);

          return (
            <li key={href} className="min-w-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-full flex-col items-center justify-center gap-[5px] text-[10.5px] font-medium tracking-tight transition-colors",
                  active
                    ? "text-brand"
                    : "text-muted-foreground active:text-foreground"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-[-1px] h-[2px] w-6 rounded-full bg-brand-vivid transition-opacity duration-200",
                    active ? "opacity-100" : "opacity-0"
                  )}
                />
                <Icon
                  className="size-[19px] shrink-0"
                  strokeWidth={active ? 1.9 : 1.6}
                />
                <span className="max-w-full truncate px-0.5">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
