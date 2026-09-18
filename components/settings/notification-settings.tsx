"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/**
 * What Closingly is allowed to interrupt you about.
 *
 * Written straight to the profile through RLS rather than through an endpoint:
 * this is one jsonb column on the caller's own row, and a route would add a
 * hop without adding a check the policy does not already make.
 */

interface Prefs {
  email_digest: "off" | "daily" | "weekly";
  proposal_opened: boolean;
  follow_up_due: boolean;
  meeting_processed: boolean;
}

const DEFAULTS: Prefs = {
  email_digest: "daily",
  proposal_opened: true,
  follow_up_due: true,
  meeting_processed: true,
};

const TOGGLES: Array<{
  key: keyof Omit<Prefs, "email_digest">;
  label: string;
  hint: string;
}> = [
  {
    key: "proposal_opened",
    label: "A client opens a proposal",
    hint: "The most time-sensitive thing this product knows. Worth being reachable for.",
  },
  {
    key: "follow_up_due",
    label: "A follow-up needs you",
    hint: "When a proposal goes unread, a deal stalls, or someone reads and goes quiet.",
  },
  {
    key: "meeting_processed",
    label: "A call has been read",
    hint: "When a recorded call becomes a deal and a drafted proposal.",
  },
];

const DIGEST_OPTIONS: Array<{ value: Prefs["email_digest"]; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "off", label: "Never" },
];

export function NotificationSettings() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;

      const { data } = await supabase
        .from("profiles")
        .select("notification_prefs")
        .eq("id", auth.user.id)
        .maybeSingle();

      if (cancelled) return;
      setPrefs({
        ...DEFAULTS,
        ...((data?.notification_prefs as Partial<Prefs> | null) ?? {}),
      });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (next: Prefs) => {
    // Optimistic: a settings toggle that waits on a round trip feels broken,
    // and the failure path here is a toast plus a revert.
    const previous = prefs;
    setPrefs(next);
    setSaving(true);

    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;

    const { error } = await supabase
      .from("profiles")
      .update({ notification_prefs: next })
      .eq("id", auth.user.id);

    setSaving(false);

    if (error) {
      toast.error("Couldn't save that.");
      if (previous) setPrefs(previous);
    }
  }, [prefs]);

  if (!prefs) {
    return (
      <div className="rounded-lg border border-border p-4" aria-hidden>
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="panel divide-y divide-border overflow-hidden">
        {TOGGLES.map((toggle) => (
          <div
            key={toggle.key}
            className="flex items-start justify-between gap-4 px-4 py-3.5"
          >
            <div className="min-w-0">
              <div className="text-[13.5px] font-medium tracking-tight">
                {toggle.label}
              </div>
              <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                {toggle.hint}
              </p>
            </div>
            <Switch
              checked={prefs[toggle.key]}
              disabled={saving}
              onCheckedChange={(checked) =>
                save({ ...prefs, [toggle.key]: checked })
              }
              aria-label={toggle.label}
            />
          </div>
        ))}
      </div>

      <div className="panel px-4 py-3.5">
        <div className="text-[13.5px] font-medium tracking-tight">
          Email summary
        </div>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
          One email covering anything you haven&rsquo;t already seen in the app.
          Nothing is ever emailed twice.
        </p>
        <div className="mt-3 inline-flex rounded-lg border border-border p-0.5">
          {DIGEST_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={saving}
              onClick={() => save({ ...prefs, email_digest: option.value })}
              className={cn(
                "rounded-[7px] px-3 py-1.5 pointer-coarse:px-4 pointer-coarse:py-2 text-[12.5px] transition-colors",
                prefs.email_digest === option.value
                  ? "bg-secondary text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
