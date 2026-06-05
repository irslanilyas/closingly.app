"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/proposal-generator", label: "Proposals" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/follow-up-writer", label: "Follow-ups" },
  { href: "/pricing-advisor", label: "Pricing" },
  { href: "/forecaster", label: "Forecast" },
  { href: "/meeting-transcriber", label: "Transcripts" },
  { href: "/scope-guardian", label: "Scope" },
];

export function Topbar({ email }: { email: string }) {
  const path = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const onLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border">
      <div className="mx-auto max-w-[1280px] px-8 h-[60px] flex items-center justify-between">
        <div className="flex items-center gap-10">
          <Link
            href="/"
            className="text-[15px] font-medium tracking-tight hover:opacity-70 transition-opacity"
          >
            RevOps&nbsp;Builder
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map((n) => {
              const active =
                n.href === "/"
                  ? path === "/"
                  : path === n.href || path.startsWith(`${n.href}/`);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cn(
                    "px-3 py-1.5 text-[13px] rounded-md transition-colors",
                    active
                      ? "text-foreground bg-secondary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-4">
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
      </div>
    </header>
  );
}
