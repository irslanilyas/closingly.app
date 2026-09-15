"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { NavList } from "./sidebar";
import { Wordmark } from "./wordmark";
import { navFor, sectionFor } from "./nav";
import { Menu, LogOut, Settings2 } from "lucide-react";

/**
 * The bar above the work. It names where you are and carries the two controls
 * that belong to the person rather than the page.
 *
 * Search is a trigger rather than an inline field: an always-visible empty
 * input on every screen is the most reliable way to make a product look like a
 * template, and the modal is what the keyboard shortcut opens anyway.
 */
export function Topbar({ email }: { email: string }) {
  const path = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const items = navFor(email);
  const section = sectionFor(path, items);
  const initial = (email.trim()[0] ?? "?").toUpperCase();

  const onLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-20 h-[60px] shrink-0 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="h-full flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile: the rail is hidden, so the wordmark and menu live here. */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation"
            className="lg:hidden size-9"
          >
            <Menu className="size-5" strokeWidth={1.5} />
          </Button>
          <div className="lg:hidden min-w-0">
            <Wordmark />
          </div>

          <span className="hidden lg:block text-[13px] font-medium tracking-tight truncate">
            {section}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <CommandSearch />
          <NotificationBell />
          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Account menu"
                className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-[12px] font-medium text-secondary-foreground transition-colors hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_7%)]"
              >
                {initial}
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="min-w-[13rem]">
              <div className="px-2 py-1.5">
                <div className="text-[12.5px] truncate">{email}</div>
                <div className="text-[11.5px] text-muted-foreground">
                  Signed in
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings2 strokeWidth={1.6} />
                  Account settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={onLogout}>
                <LogOut strokeWidth={1.6} />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-[272px] p-0 flex flex-col">
          <SheetHeader className="h-[60px] justify-center border-b border-border">
            <SheetTitle asChild>
              <div>
                <Wordmark href={null} />
              </div>
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-3">
            <NavList items={items} onNavigate={() => setMenuOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
