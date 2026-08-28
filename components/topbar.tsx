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
  SheetTrigger,
} from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { Menu, LogOut } from "lucide-react";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/meetings", label: "Meetings" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/insights", label: "Insights" },
];

export function Topbar({ email }: { email: string }) {
  const path = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);

  const onLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const isActive = (href: string) =>
    href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 h-[60px] flex items-center justify-between">
        <div className="flex items-center gap-4 lg:gap-10">
          <Link
            href="/"
            className="text-[15px] font-medium tracking-tight hover:opacity-70 transition-opacity"
          >
            ROS
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "px-3 py-1.5 text-[13px] rounded-md transition-colors",
                  isActive(n.href)
                    ? "text-foreground bg-secondary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Desktop right section */}
        <div className="hidden lg:flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/settings"
            className="text-[12.5px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {email}
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={onLogout}
            className="text-[12.5px] h-8 px-2.5 text-muted-foreground hover:text-foreground"
          >
            Logout
          </Button>
        </div>

        {/* Mobile right section */}
        <div className="flex lg:hidden items-center gap-2">
          <ThemeToggle />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="size-9 p-0"
                aria-label="Open navigation menu"
              >
                <Menu className="size-5" strokeWidth={1.5} />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px] sm:w-[320px]">
              <SheetHeader>
                <SheetTitle className="text-[15px] font-medium tracking-tight text-left">
                  ROS
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 mt-6">
                {NAV.map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "px-3 py-2.5 text-[14px] rounded-md transition-colors",
                      isActive(n.href)
                        ? "text-foreground bg-secondary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                    )}
                  >
                    {n.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-6 pt-6 border-t border-border space-y-3">
                <Link
                  href="/settings"
                  onClick={() => setOpen(false)}
                  className="block text-[13px] text-muted-foreground hover:text-foreground transition-colors px-3"
                >
                  {email}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onLogout();
                  }}
                  className="flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5"
                >
                  <LogOut className="size-3.5" strokeWidth={1.5} />
                  Sign out
                </button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
