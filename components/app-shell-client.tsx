"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ShellFrame } from "./shell/shell-frame";

/**
 * Client shell, for the handful of pages that must resolve their own session
 * in the browser. Same frame as the server shell — the two share ShellFrame so
 * the app can never render two different chromes.
 */
export function AppShellClient({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }

      // The onboarding gate. It lives here rather than in the proxy because
      // the proxy runs on every request including assets and API calls, and
      // this check costs a query — here it runs once, where the session is
      // already being resolved.
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed_at")
        .eq("id", data.user.id)
        .maybeSingle();

      if (!profile?.onboarding_completed_at) {
        router.replace("/onboarding");
        return;
      }

      setEmail(data.user.email ?? "unknown");
    })();
  }, [router]);

  if (!email) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="size-2 rounded-full bg-brand/40 animate-pulse" />
      </div>
    );
  }

  return <ShellFrame email={email}>{children}</ShellFrame>;
}
