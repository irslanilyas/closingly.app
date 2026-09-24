"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "./notification-bell";
import { CommandSearch } from "./command-search";
import { Wordmark } from "./wordmark";
import { navFor, sectionFor } from "./nav";
import {
  ArrowRightStartOnRectangleIcon,
} from "@heroicons/react/24/outline";

/**
 * The bar above the work. It names where you are and carries the controls
 * that belong to the person rather than the page.
 *
 * Search is a trigger rather than an inline field: an always-visible empty
 * input on every screen is the most reliable way to make a product look like a
 * template, and the modal is what the keyboard shortcut opens anyway.
 *
 * Below the rail breakpoint the bottom bar carries navigation, so this bar
 * carries the wordmark instead of the section name, and everything that is
 * not a destination (account, theme, the founders' build log) folds into the
 * account menu rather than crowding a 375px row.
 */
export function Topbar({ email }: { email: string }) {
  const path = usePathname();
  const router = useRouter();

  const items = navFor(email);
  const section = sectionFor(path, items);
  const extras = items.filter((item) => !item.bar);
  const initial = (email.trim()[0] ?? "?").toUpperCase();

  const onLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-20 h-[60px] shrink-0 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="h-full flex items-center justify-between gap-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] lg:px-8">
        <div className="flex items-center min-w-0">
          <div className="lg:hidden min-w-0">
            <Wordmark />
          </div>
          <span className="hidden lg:block text-[13px] font-medium tracking-tight truncate">
            {section}
          </span>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <CommandSearch />
          <NotificationBell />
          <ThemeToggle className="hidden lg:flex" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Account menu"
                className="grid size-10 shrink-0 place-items-center rounded-full lg:size-8"
              >
                <span className="grid size-8 place-items-center rounded-full bg-secondary text-[12px] font-medium text-secondary-foreground transition-colors hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_7%)]">
                  {initial}
                </span>
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-[15rem]">
              <div className="px-2 py-1.5">
                <div className="text-[12.5px] truncate">{email}</div>
                <div className="text-[11.5px] text-muted-foreground">
                  Signed in
                </div>
              </div>
              <DropdownMenuSeparator />

              {extras.map(({ href, label, Icon }) => (
                <DropdownMenuItem
                  key={href}
                  asChild
                  // The rail already lists these on desktop; only the settings
                  // shortcut has always lived here at every width.
                  className={href === "/settings" ? undefined : "lg:hidden"}
                >
                  <Link href={href}>
                    <Icon strokeWidth={1.6} />
                    {href === "/settings" ? "Account settings" : label}
                  </Link>
                </DropdownMenuItem>
              ))}

              <div className="lg:hidden">
                <DropdownMenuSeparator />
                <div className="flex items-center justify-between gap-3 px-2 py-1.5">
                  <span className="text-[13px]">Theme</span>
                  <ThemeToggle />
                </div>
              </div>

              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onLogout}>
                <ArrowRightStartOnRectangleIcon strokeWidth={1.6} />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
