"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ShellFrame } from "./shell/shell-frame";

const onboardedKey = (userId: string) => `closingly:onboarded:${userId}`;

function rememberedOnboarded(userId: string): boolean {
  try {
    return localStorage.getItem(onboardedKey(userId)) === "1";
  } catch {
    return false;
  }
}

/**
 * Client shell, for pages that resolve their own session in the browser. Same
 * frame as everywhere else: ShellFrame is the only chrome the app has.
 *
 * The proxy has already refused any request without a session, so this does
 * not need a network round trip before drawing the page. The session is read
 * locally, and the onboarding check blocks only the first time: once a user is
 * known to be onboarded the page renders at once and the check re-runs quietly
 * behind it. Before this, every page waited on two sequential Supabase calls
 * before it could even start loading its own data.
 */
export function AppShellClient({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        router.replace("/login");
        return;
      }

      if (rememberedOnboarded(user.id) && !cancelled) {
        setEmail(user.email ?? "unknown");
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed_at")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;

      if (!profile?.onboarding_completed_at) {
        try {
          localStorage.removeItem(onboardedKey(user.id));
        } catch {}
        router.replace("/onboarding");
        return;
      }

      try {
        localStorage.setItem(onboardedKey(user.id), "1");
      } catch {}
      setEmail(user.email ?? "unknown");
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!email) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="size-2 animate-pulse rounded-full bg-brand/40" />
      </div>
    );
  }

  return <ShellFrame email={email}>{children}</ShellFrame>;
}
