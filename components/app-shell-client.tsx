"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Topbar } from "./topbar";

export function AppShellClient({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push("/login");
        return;
      }
      setEmail(data.user.email ?? "unknown");
    });
  }, [router]);

  if (!email) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="size-2 rounded-full bg-foreground/30 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Topbar email={email} />
      <main className="flex-1">
        <div className="mx-auto max-w-[1280px] px-8 py-10">{children}</div>
      </main>
    </div>
  );
}
