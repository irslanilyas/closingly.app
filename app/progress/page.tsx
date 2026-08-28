"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShellClient } from "@/components/app-shell-client";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/client";
import { isFounder } from "@/lib/founders";
import { PROGRESS_LOG } from "@/lib/progress-log";
import { Check } from "lucide-react";

/**
 * A build log for the two people building this, not a customer-facing
 * changelog. Gated separately from the general auth check in AppShellClient
 * — an authenticated beta tester still shouldn't land here by typing the URL.
 */
export default function ProgressPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (isFounder(data.user?.email)) {
          setAllowed(true);
        } else {
          router.replace("/");
        }
      });
  }, [router]);

  if (!allowed) return null;

  return (
    <AppShellClient>
      <PageHeader
        eyebrow="Progress"
        title="What's built so far"
        description="A running log, not a pitch — updated whenever something ships."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-[900px]">
        {PROGRESS_LOG.map((section) => (
          <div
            key={section.title}
            className="rounded-lg border border-border bg-card p-5"
          >
            <div className="flex items-center gap-2.5 mb-4">
              <section.Icon
                className="size-4 text-[var(--accent-sage)]"
                strokeWidth={1.75}
              />
              <h2 className="text-[13.5px] font-medium">{section.title}</h2>
            </div>
            <ul className="space-y-2">
              {section.items.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Check
                    className="size-3.5 mt-[3px] shrink-0 text-muted-foreground/50"
                    strokeWidth={2}
                  />
                  <span className="text-[12.5px] leading-relaxed text-foreground/85">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </AppShellClient>
  );
}
