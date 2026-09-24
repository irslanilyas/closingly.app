"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { callActivityKey, useCallActivity, type CallActivity } from "./use-call-activity";

/**
 * Mounted once in the app frame. Two jobs:
 *
 * 1. Listen for the person's own meetings changing (Supabase Realtime, scoped
 *    by RLS) and refresh the shared activity cache the moment one does, so a
 *    finished call shows up without waiting for a poll.
 * 2. Say so when a call changes state while they are elsewhere in the app:
 *    the call ended and is being written up, the deal is ready, it did not
 *    look like a sales call, or it failed. Wherever they are, they hear it.
 *
 * The first load is only remembered, never announced: a toast for something
 * that finished an hour ago is noise.
 */
export function CallActivityWatcher() {
  const qc = useQueryClient();
  const router = useRouter();
  const { data } = useCallActivity();
  const seen = useRef<Map<string, string> | null>(null);

  // Realtime: a signal to refetch, not a data source. The payload can carry a
  // whole transcript, and the activity endpoint already knows how to shape a
  // row for the page.
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      const userId = session?.user.id;
      if (!userId || cancelled) return;
      channel = supabase
        .channel(`meetings-activity:${userId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "meetings", filter: `user_id=eq.${userId}` },
          () => qc.invalidateQueries({ queryKey: callActivityKey })
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [qc]);

  useEffect(() => {
    if (!data) return;
    const signature = (call: CallActivity) => `${call.status}:${call.deal_id ?? ""}`;

    if (seen.current === null) {
      seen.current = new Map(data.map((call) => [call.id, signature(call)]));
      return;
    }

    for (const call of data) {
      const before = seen.current.get(call.id);
      const now = signature(call);
      if (before === now) continue;
      seen.current.set(call.id, now);
      announce(call, before);
    }

    function announce(call: CallActivity, before: string | undefined) {
      const name = call.deal_name ?? call.title;
      if (call.status === "processing" && !before?.startsWith("processing")) {
        toast(`"${call.title}" ended. Writing it up now.`, {
          description: "Usually 2 to 5 minutes. Follow it on your dashboard.",
          action: { label: "Follow", onClick: () => router.push("/") },
        });
        return;
      }
      if (call.status === "completed" && call.deal_id) {
        qc.invalidateQueries({ queryKey: ["pipeline"] });
        toast.success(`Proposal ready for ${name}`, {
          description: "The deal is in your pipeline under Lead.",
          action: { label: "Open deal", onClick: () => router.push(`/pipeline/${call.deal_id}`) },
          duration: 10_000,
        });
        return;
      }
      if (call.status === "completed") {
        toast(`"${call.title}" didn't look like a sales call`, {
          description: "Nothing was created. You can still make a deal from it.",
          action: { label: "Review", onClick: () => router.push("/") },
          duration: 10_000,
        });
        return;
      }
      if (call.status === "failed") {
        toast.error(`Couldn't finish "${call.title}"`, {
          description: call.error ?? undefined,
          action: { label: "Review", onClick: () => router.push("/") },
          duration: 10_000,
        });
      }
    }
  }, [data, qc, router]);

  return null;
}
