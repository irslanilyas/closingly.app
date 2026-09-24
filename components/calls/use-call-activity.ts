"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CallActivity } from "@/app/api/meetings/activity/route";
import {
  SLOW_AFTER_MINUTES,
  type MeetingProgress,
  type ProcessingStage,
} from "@/lib/meetings/progress";

export type { CallActivity };

export const callActivityKey = ["calls", "activity"] as const;

const isLive = (call: CallActivity) =>
  call.status === "processing" || call.status === "recording";

/**
 * Calls in flight and just finished. One cache entry shared by every surface
 * that shows them (the dashboard card, the pipeline placeholders, the watcher
 * that raises toasts), so they never disagree about where a call is.
 *
 * Polls briskly only while something is live. Realtime (see the watcher)
 * makes most updates arrive sooner; the poll is the floor, and React Query
 * pauses it while the tab is hidden.
 */
export function useCallActivity() {
  return useQuery({
    queryKey: callActivityKey,
    queryFn: async (): Promise<CallActivity[]> => {
      const res = await fetch("/api/meetings/activity");
      if (!res.ok) throw new Error("activity_failed");
      return ((await res.json()) as { calls: CallActivity[] }).calls;
    },
    refetchInterval: (query) => (query.state.data?.some(isLive) ? 8_000 : 60_000),
    staleTime: 4_000,
    retry: 1,
  });
}

/** Where a call is, as the card presents it. */
export type CallPhase =
  | { kind: "recording" }
  | { kind: "processing"; stage: ProcessingStage; startedAt: number; slow: boolean }
  | { kind: "ready"; dealId: string }
  | { kind: "not_sales"; meetingKind: string | null }
  | { kind: "failed"; error: string };

export function phaseOf(call: CallActivity, now: number): CallPhase {
  if (call.status === "recording") return { kind: "recording" };
  if (call.status === "failed") {
    return { kind: "failed", error: call.error ?? "Something went wrong while reading this call." };
  }
  if (call.status === "completed") {
    return call.deal_id
      ? { kind: "ready", dealId: call.deal_id }
      : { kind: "not_sales", meetingKind: call.meeting_kind };
  }
  const progress: MeetingProgress | null = call.progress;
  const startedAt = new Date(progress?.started_at ?? call.updated_at).getTime();
  return {
    kind: "processing",
    stage: progress?.stage && progress.stage !== "done" && progress.stage !== "failed" ? progress.stage : "queued",
    startedAt,
    slow: now - startedAt > SLOW_AFTER_MINUTES * 60_000,
  };
}

/* ── Dismissal ────────────────────────────────────────────────────────────
   Per browser, on purpose: hiding a finished card is a personal tidy-up,
   not a fact about the call. Kept in localStorage behind a tiny store so
   every card and the pipeline agree the moment one is dismissed.          */

const DISMISS_KEY = "closingly:dismissed-calls";
const listeners = new Set<() => void>();
let cache: string | null = null;

function readDismissed(): string {
  if (cache !== null) return cache;
  try {
    cache = localStorage.getItem(DISMISS_KEY) ?? "[]";
  } catch {
    cache = "[]";
  }
  return cache;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDismissedCalls() {
  const raw = useSyncExternalStore(subscribe, readDismissed, () => "[]");
  const dismissed = new Set<string>(safeParse(raw));

  const dismiss = useCallback((id: string) => {
    const next = [...new Set([...safeParse(readDismissed()), id])].slice(-50);
    cache = JSON.stringify(next);
    try {
      localStorage.setItem(DISMISS_KEY, cache);
    } catch {
      // Private mode: the card still hides for this page view.
    }
    listeners.forEach((l) => l());
  }, []);

  return { dismissed, dismiss };
}

function safeParse(raw: string): string[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}
