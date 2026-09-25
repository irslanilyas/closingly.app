"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  ArrowPathIcon,
  CheckIcon,
  ClipboardDocumentCheckIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import type { GenerationState } from "@/lib/types";

/**
 * What setup finished, and what was skipped.
 *
 * Supportive, never a gate: every item here can stay open forever and the
 * product still works. It is also the only place the starter proposal's
 * generation state is visible, so a job that fails is something the person can
 * see and act on rather than a document that silently never appears.
 */

interface ChecklistData {
  dismissed: boolean;
  calendarStatus: string;
  starter: {
    id: string;
    state: GenerationState;
    /** When it was queued, so a stalled queue can be told from a slow one. */
    queuedAt: string | null;
  } | null;
  hasDeal: boolean;
}

/** Only the states worth polling through. The rest are settled. */
const IN_FLIGHT: GenerationState[] = [
  "queued",
  "processing_profile",
  "processing_document",
  "validating",
];

const POLL_MS = 6000;

/**
 * How long a queued proposal may sit before the checklist stops pretending it
 * is on its way and offers to write it directly. The queue only drains when
 * something calls the worker, and when nothing does, this is the way out.
 */
const STUCK_AFTER_MS = 90_000;

export function SetupChecklist() {
  const [data, setData] = useState<ChecklistData | null>(null);

  const read = useCallback(async (): Promise<ChecklistData | null> => {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return null;

    const [{ data: profile }, { data: starter }, { count }] = await Promise.all([
      supabase
        .from("profiles")
        .select("calendar_status, checklist_state")
        .eq("id", auth.user.id)
        .maybeSingle(),
      supabase
        .from("proposals")
        .select("id, generation_state, generation_meta, created_at")
        .eq("user_id", auth.user.id)
        .eq("kind", "starter")
        .maybeSingle(),
      supabase
        .from("deals")
        .select("id", { count: "exact", head: true })
        .eq("user_id", auth.user.id),
    ]);

    return {
      dismissed:
        (profile?.checklist_state as { dismissed?: boolean } | null)?.dismissed ===
        true,
      calendarStatus: (profile?.calendar_status as string) ?? "pending",
      starter: starter
        ? {
            id: starter.id as string,
            state: starter.generation_state as GenerationState,
            queuedAt:
              ((starter.generation_meta as Record<string, unknown> | null)
                ?.queued_at as string | undefined) ??
              (starter.created_at as string | null) ??
              null,
          }
        : null,
      hasDeal: (count ?? 0) > 0,
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    read().then((next) => {
      if (!cancelled && next) setData(next);
    });
    return () => {
      cancelled = true;
    };
  }, [read]);

  // Poll only while the proposal is actually being written. Once it settles
  // there is nothing here that changes without a page action.
  const inFlight = !!data?.starter && IN_FLIGHT.includes(data.starter.state);

  useEffect(() => {
    if (!inFlight) return;

    let cancelled = false;
    const timer = setInterval(() => {
      read().then((next) => {
        if (!cancelled && next) setData(next);
      });
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [inFlight, read]);

  const [working, setWorking] = useState(false);

  /**
   * Runs the generation directly instead of waiting on the queue. Same code
   * the worker runs — this is a different door to it, not a different path.
   */
  const generateStarter = async () => {
    if (working) return;
    setWorking(true);

    try {
      const res = await fetch("/api/proposals/starter", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error === "no_specification"
            ? "Your setup answers are missing. Run setup again from Account."
            : "Couldn't write it. Try once more."
        );
      }
      toast.success("Your starter proposal is ready.");
      const next = await read();
      if (next) setData(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't write it.");
    } finally {
      setWorking(false);
    }
  };

  const setDismissed = async (dismissed: boolean) => {
    setData((d) => (d ? { ...d, dismissed } : d));

    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;

    await supabase
      .from("profiles")
      .update({ checklist_state: { dismissed } })
      .eq("id", auth.user.id);
  };

  if (!data) return null;

  if (data.dismissed) {
    return (
      <button
        type="button"
        onClick={() => setDismissed(false)}
        className="mb-8 inline-flex items-center gap-2 text-[12.5px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <ClipboardDocumentCheckIcon className="size-3.5" strokeWidth={1.6} />
        Show setup checklist
      </button>
    );
  }

  const items = buildItems(data);
  const done = items.filter((i) => i.status === "done").length;

  return (
    <div className="panel mb-8 p-4 sm:p-5 resolve">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[13.5px] font-medium">
            Getting set up
          </div>
          <div className="mt-0.5 text-[12px] text-muted-foreground tabular-nums">
            {done} of {items.length} done. Nothing here blocks anything.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Hide setup checklist"
          className="-m-1.5 shrink-0 rounded-md p-2.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors sm:m-0 sm:p-1"
        >
          <XMarkIcon className="size-3.5" strokeWidth={1.6} />
        </button>
      </div>

      <ul className="mt-4 space-y-2.5">
        {items.map((item) => (
          <li key={item.key} className="flex items-start gap-2.5">
            <Marker status={item.status} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] leading-snug">
                {item.href ? (
                  <Link
                    href={item.href}
                    className="hover:text-brand transition-colors underline decoration-border hover:decoration-brand"
                  >
                    {item.label}
                  </Link>
                ) : (
                  item.label
                )}
              </div>
              <div
                className={cn(
                  "mt-0.5 text-[11.5px] leading-relaxed",
                  item.status === "failed"
                    ? "text-destructive"
                    : "text-muted-foreground"
                )}
              >
                {item.detail}
              </div>
              {item.action && (
                <button
                  type="button"
                  disabled={working}
                  onClick={generateStarter}
                  className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 pointer-coarse:px-3 pointer-coarse:py-2 text-[11.5px] transition-colors hover:border-brand/50 hover:text-brand disabled:opacity-60"
                >
                  {working ? (
                    <Spinner className="size-3" />
                  ) : (
                    <ArrowPathIcon className="size-3" strokeWidth={1.8} />
                  )}
                  {working ? "Writing it…" : item.action.label}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

type ItemStatus = "done" | "running" | "open" | "skipped" | "failed";

function Marker({ status }: { status: ItemStatus }) {
  if (status === "running") {
    return (
      <Spinner className="mt-[3px] size-3.5 shrink-0 text-brand" />
    );
  }
  if (status === "failed") {
    return (
      <ExclamationTriangleIcon
        className="mt-[3px] size-3.5 shrink-0 text-destructive"
        strokeWidth={1.8}
      />
    );
  }
  if (status === "done") {
    return (
      <span className="mt-[3px] grid size-3.5 shrink-0 place-items-center rounded-full bg-brand text-brand-fg">
        <CheckIcon className="size-2.5" strokeWidth={3} />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "mt-[3px] size-3.5 shrink-0 rounded-full border",
        status === "skipped" ? "border-border" : "border-foreground/30"
      )}
    />
  );
}

interface Item {
  key: string;
  /** An inline button, for the cases where the fix is one click. */
  action?: { label: string; run: "generate_starter" };
  label: string;
  detail: string;
  status: ItemStatus;
  href?: string;
}

function buildItems(data: ChecklistData): Item[] {
  return [
    starterItem(data.starter),
    {
      key: "calendar",
      label: "Calendar",
      detail:
        data.calendarStatus === "connected"
          ? "Connected. Upcoming calls appear in Meetings."
          : data.calendarStatus === "skipped"
            ? "Skipped. Turn it back on from Account whenever you want."
            : "Not connected yet. Reconnect from Account.",
      status: data.calendarStatus === "connected" ? "done" : "skipped",
      href: data.calendarStatus === "connected" ? "/meetings" : "/settings",
    },
    {
      key: "first-deal",
      label: data.hasDeal ? "First deal in your pipeline" : "Get a first call in",
      detail: data.hasDeal
        ? "Your pipeline has something in it."
        : "Record a call, or paste a transcript from a call that already happened.",
      status: data.hasDeal ? "done" : "open",
      href: data.hasDeal ? "/pipeline" : "/meetings",
    },
  ];
}

function starterItem(
  starter: ChecklistData["starter"]
): Item {
  if (!starter) {
    return {
      key: "starter",
      label: "Your starter proposal",
      detail: "Not created. Finish setup from Account to generate one.",
      status: "open",
      href: "/settings",
    };
  }

  if (IN_FLIGHT.includes(starter.state)) {
    // A queue only drains if something calls the worker. When nothing has,
    // this would spin forever, so past a threshold the checklist stops
    // claiming progress and offers to write it directly instead.
    const queuedFor = starter.queuedAt
      ? Date.now() - new Date(starter.queuedAt).getTime()
      : 0;

    if (queuedFor > STUCK_AFTER_MS) {
      return {
        key: "starter",
        label: "Your starter proposal",
        detail:
          "Still queued. The background worker has not picked it up, which is normal when nothing is calling it.",
        status: "open",
        action: { label: "Write it now", run: "generate_starter" },
      };
    }

    return {
      key: "starter",
      label: "Your starter proposal",
      detail:
        starter.state === "validating"
          ? "Almost ready."
          : "Being written from your setup answers.",
      status: "running",
    };
  }

  if (starter.state === "failed_retryable") {
    return {
      key: "starter",
      label: "Your starter proposal",
      detail: "That attempt failed. Another one is queued.",
      status: "open",
      action: { label: "Try again now", run: "generate_starter" },
    };
  }

  if (starter.state === "failed_terminal") {
    return {
      key: "starter",
      label: "Your starter proposal",
      detail: "Generation failed. Nothing else is affected by this.",
      status: "failed",
      action: { label: "Try again", run: "generate_starter" },
    };
  }

  if (starter.state === "needs_input") {
    return {
      key: "starter",
      label: "Your starter proposal",
      detail: "Written, but a few sections came back thin. Worth a read.",
      status: "open",
      href: `/proposals/${starter.id}`,
    };
  }

  return {
    key: "starter",
    label: "Your starter proposal",
    detail: "Ready to read and edit.",
    status: "done",
    href: `/proposals/${starter.id}`,
  };
}
