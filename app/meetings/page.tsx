"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShellClient } from "@/components/app-shell-client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ImportCallDialog } from "@/components/meetings/import-call-dialog";
import { createClient } from "@/lib/supabase/client";
import { type Meeting } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  RefreshCw,
  Video,
  CalendarX2,
  FileUp,
  Loader2,
  Mic,
  MicOff,
  FileText,
  ArrowRight,
  CalendarOff,
} from "lucide-react";

/** How far back the history goes. Older calls live on their deal. */
const HISTORY_DAYS = 120;

/** A call is "upcoming" until it has been over for this long. */
const RECENT_GRACE_HOURS = 12;

type Tab = "upcoming" | "past" | "other";

export default function MeetingsPage() {
  // The load time is kept alongside the rows rather than read from the clock
  // during render: the upcoming/past split depends on "now", and deriving it
  // mid-render makes a row silently jump lists on an unrelated re-render.
  const [state, setState] = useState<{ rows: Meeting[]; at: number } | null>(
    null
  );
  const loading = state === null;
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("upcoming");

  // Query Supabase directly rather than through an API route — RLS already
  // scopes this to the current user, and it saves a server round trip.
  const read = useCallback(async (): Promise<Meeting[]> => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("meetings")
      .select("*")
      .gte(
        "starts_at",
        new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString()
      )
      .order("starts_at", { ascending: false });

    return !error && data ? (data as Meeting[]) : [];
  }, []);

  const load = useCallback(async () => {
    const rows = await read();
    setState({ rows, at: Date.now() });
  }, [read]);

  useEffect(() => {
    let cancelled = false;
    read().then((rows) => {
      if (!cancelled) setState({ rows, at: Date.now() });
    });
    return () => {
      cancelled = true;
    };
  }, [read]);

  /**
   * A meeting the worker is still acting on changes status with no user
   * action behind it, so the page has to go looking. Without this an import
   * sits on "Processing" until someone manually refreshes, which reads as
   * the import having silently failed.
   *
   * Only polls while something is actually in flight, and stops on its own
   * once everything settles.
   */
  const hasInFlight = (state?.rows ?? []).some(
    (m) => m.status === "processing" || m.status === "recording"
  );

  useEffect(() => {
    if (!hasInFlight) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [hasInFlight, load]);

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/calendar/sync", { method: "POST" });
      const body = await res.json();

      if (!res.ok) {
        if (body.error === "google_disconnected") {
          toast.error("Google access expired. Reconnect it in Account.");
        } else {
          toast.error("Couldn't sync your calendar. Try again.");
        }
        return;
      }

      const skipped = (body.synced ?? 0) - (body.calls ?? body.synced ?? 0);
      toast.success(
        body.synced === 0
          ? "Nothing new on your calendar."
          : `${body.calls ?? body.synced} call${(body.calls ?? body.synced) === 1 ? "" : "s"} synced${
              skipped > 0 ? `, ${skipped} other entr${skipped === 1 ? "y" : "ies"} set aside` : ""
            }.`
      );
      await load();
    } catch {
      toast.error("Couldn't reach the server. Try again.");
    } finally {
      setSyncing(false);
    }
  };

  const toggleAgent = async (meeting: Meeting, enabled: boolean) => {
    setPending(meeting.id);

    // Optimistic — the switch should feel instant; we roll back on failure.
    setState((prev) =>
      prev
        ? {
            ...prev,
            rows: prev.rows.map((m) =>
              m.id === meeting.id ? { ...m, agent_enabled: enabled } : m
            ),
          }
        : prev
    );

    try {
      const res = await fetch(`/api/meetings/${meeting.id}/agent`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });

      if (!res.ok) {
        const body = await res.json();

        if (body.error === "allowance_too_low") {
          const minutes = Math.max(1, Math.floor(body.remaining_seconds / 60));
          throw new Error(
            `Only ${minutes} min of recording allowance left, too little to be worth starting. Check Account.`
          );
        }

        const messages: Record<string, string> = {
          no_meeting_link: "That meeting has no call link to join.",
          meeting_passed: "That meeting has already started.",
          allowance_exhausted:
            "You've used your recording allowance. Check Account.",
          schedule_failed:
            "Couldn't schedule the agent with Recall. Try again.",
        };
        throw new Error(messages[body.error] ?? "Couldn't update the agent.");
      }
    } catch (err) {
      setState((prev) =>
        prev
          ? {
              ...prev,
              rows: prev.rows.map((m) =>
                m.id === meeting.id ? { ...m, agent_enabled: !enabled } : m
              ),
            }
          : prev
      );
      toast.error(err instanceof Error ? err.message : "Couldn't update the agent.");
    } finally {
      setPending(null);
    }
  };

  const { upcoming, past, other } = useMemo(() => {
    const meetings = state?.rows ?? [];
    const cutoff = (state?.at ?? 0) - RECENT_GRACE_HOURS * 3_600_000;

    const upcoming: Meeting[] = [];
    const past: Meeting[] = [];
    const other: Meeting[] = [];

    for (const m of meetings) {
      if (m.is_call === false) {
        other.push(m);
        continue;
      }
      const starts = m.starts_at ? new Date(m.starts_at).getTime() : 0;
      // An imported transcript is always history: it was pasted after the fact.
      if (starts >= cutoff && m.google_event_id) upcoming.push(m);
      else past.push(m);
    }

    // Upcoming reads forward in time; history reads backward from today.
    upcoming.sort(
      (a, b) =>
        new Date(a.starts_at ?? 0).getTime() - new Date(b.starts_at ?? 0).getTime()
    );

    return { upcoming, past, other };
  }, [state]);

  const rows = tab === "upcoming" ? upcoming : tab === "past" ? past : other;
  const armed = upcoming.filter((m) => m.agent_enabled).length;
  const grouped = useMemo(() => groupByDay(rows), [rows]);

  const TABS: Array<{ value: Tab; label: string; count: number }> = [
    { value: "upcoming", label: "Upcoming", count: upcoming.length },
    { value: "past", label: "History", count: past.length },
    { value: "other", label: "Not calls", count: other.length },
  ];

  return (
    <AppShellClient>
      <PageHeader
        title="Your calls"
        description="Switch the notetaker on for a meeting and it will join, record, and turn the conversation into a deal. Everything it has already read is kept in History."
        right={
          <div className="flex items-center gap-2">
            <ImportCallDialog onImported={load} />
            <Button
              onClick={sync}
              disabled={syncing}
              variant="outline"
              size="lg"
              className="text-[12.5px] gap-2"
            >
              <RefreshCw
                className={cn("size-3.5", syncing && "animate-spin")}
                strokeWidth={1.5}
              />
              {syncing ? "Syncing…" : "Sync calendar"}
            </Button>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors",
                tab === t.value
                  ? "bg-secondary font-medium text-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              )}
            >
              {t.label}
              {!loading && (
                <span className="text-[11.5px] tabular-nums text-muted-foreground">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "upcoming" && armed > 0 && (
          <div className="text-[12.5px] text-muted-foreground tabular-nums">
            {armed} with the notetaker on
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[68px] w-full rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState tab={tab} onSync={sync} syncing={syncing} onImported={load} />
      ) : tab === "other" ? (
        <NotCallsList meetings={other} />
      ) : (
        <div className="space-y-8">
          {grouped.map(({ day, items }) => (
            <section key={day}>
              <div className="label mb-2.5">{day}</div>
              <div className="panel divide-y divide-border overflow-hidden">
                {items.map((meeting) =>
                  tab === "past" ? (
                    <HistoryRow key={meeting.id} meeting={meeting} />
                  ) : (
                    <MeetingRow
                      key={meeting.id}
                      meeting={meeting}
                      pending={pending === meeting.id}
                      onToggle={(enabled) => toggleAgent(meeting, enabled)}
                    />
                  )
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </AppShellClient>
  );
}

/* ── Upcoming ──────────────────────────────────────────────────────────── */

function MeetingRow({
  meeting,
  pending,
  onToggle,
}: {
  meeting: Meeting;
  pending: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  const hasLink = Boolean(meeting.meet_link);
  const started = meeting.starts_at
    ? new Date(meeting.starts_at) < new Date()
    : false;
  const canArm = hasLink && !started;

  return (
    <div className="flex items-center gap-4 px-4 py-3.5">
      <div className="w-[64px] shrink-0 text-[12.5px] tabular-nums text-muted-foreground">
        {formatTime(meeting.starts_at)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium tracking-tight">
          {meeting.title ?? "Untitled meeting"}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
          {hasLink ? (
            <span className="inline-flex items-center gap-1.5">
              <Video className="size-3" strokeWidth={1.5} />
              {platformLabel(meeting.platform)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <CalendarX2 className="size-3" strokeWidth={1.5} />
              No call link
            </span>
          )}
          {meeting.attendees.length > 0 && (
            <span>· {meeting.attendees.length} attending</span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span
          className={cn(
            "hidden text-[11px] uppercase tracking-[0.1em] sm:inline",
            meeting.agent_enabled ? "font-medium text-brand" : "text-muted-foreground"
          )}
        >
          {meeting.agent_enabled ? "Notetaker on" : "Notetaker off"}
        </span>
        <Switch
          checked={meeting.agent_enabled}
          onCheckedChange={onToggle}
          disabled={pending || !canArm}
          aria-label={`Notetaker for ${meeting.title ?? "meeting"}`}
        />
      </div>
    </div>
  );
}

/* ── History ───────────────────────────────────────────────────────────── */

/**
 * What happened to a call that has already been.
 *
 * The question people actually have looking at history is "did it record?" —
 * so that is the primary thing on the row, stated either way, rather than a
 * status string that only makes sense if you know the state machine.
 */
function HistoryRow({ meeting }: { meeting: Meeting }) {
  const imported = !meeting.google_event_id && !!meeting.transcript;
  const processing = meeting.status === "processing";
  const failed = meeting.status === "failed";
  const recorded = !!meeting.transcript;

  const minutes = meeting.recording_seconds
    ? Math.max(1, Math.round(meeting.recording_seconds / 60))
    : null;

  return (
    <div className="flex items-center gap-4 px-4 py-3.5">
      <div className="w-[64px] shrink-0 text-[12.5px] tabular-nums text-muted-foreground">
        {formatTime(meeting.starts_at)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium tracking-tight">
          {meeting.title ?? "Untitled meeting"}
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
          {processing ? (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="size-3 animate-spin" strokeWidth={1.75} />
              Reading the transcript
            </span>
          ) : failed ? (
            <span className="inline-flex items-center gap-1.5 text-destructive">
              <MicOff className="size-3" strokeWidth={1.7} />
              Recording failed
            </span>
          ) : imported ? (
            <span className="inline-flex items-center gap-1.5 text-brand">
              <FileUp className="size-3" strokeWidth={1.7} />
              Imported transcript
            </span>
          ) : recorded ? (
            <span className="inline-flex items-center gap-1.5 text-brand">
              <Mic className="size-3" strokeWidth={1.7} />
              Notetaker recorded this
              {minutes ? ` · ${minutes} min` : ""}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <MicOff className="size-3" strokeWidth={1.7} />
              Notetaker was off
            </span>
          )}

          {meeting.meeting_kind && (
            <span className="text-muted-foreground">
              · {meetingKindLabel(meeting.meeting_kind)}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {meeting.deal_id ? (
          <Link
            href={`/pipeline/${meeting.deal_id}`}
            className="inline-flex items-center gap-1 text-[12.5px] text-muted-foreground transition-colors hover:text-brand"
          >
            <FileText className="size-3.5" strokeWidth={1.6} />
            <span className="hidden sm:inline">View deal</span>
            <ArrowRight className="size-3" strokeWidth={1.8} />
          </Link>
        ) : recorded ? (
          <span className="text-[11.5px] text-muted-foreground">
            No deal from this one
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ── Not calls ─────────────────────────────────────────────────────────── */

/**
 * Everything the classifier set aside, with its reason.
 *
 * These are not hidden because the rules will occasionally be wrong, and a
 * client call that silently vanished from the product would be much worse
 * than a flight confirmation appearing in a list nobody opens.
 */
function NotCallsList({ meetings }: { meetings: Meeting[] }) {
  return (
    <div>
      <p className="mb-3 max-w-[64ch] text-[12.5px] leading-relaxed text-muted-foreground">
        Calendar entries that don&rsquo;t look like client calls, so they stay
        out of the way. If something here is a real call, it means it had no
        join link and nobody else invited.
      </p>
      <div className="panel divide-y divide-border overflow-hidden">
        {meetings.map((m) => (
          <div key={m.id} className="flex items-center gap-4 px-4 py-3">
            <div className="w-[64px] shrink-0 text-[12.5px] tabular-nums text-muted-foreground">
              {formatTime(m.starts_at)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] text-muted-foreground">
                {m.title ?? "Untitled"}
              </div>
            </div>
            <div className="shrink-0 text-[11.5px] text-muted-foreground">
              {m.not_call_reason ?? "Not a call"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Empty states ──────────────────────────────────────────────────────── */

function EmptyState({
  tab,
  onSync,
  syncing,
  onImported,
}: {
  tab: Tab;
  onSync: () => void;
  syncing: boolean;
  onImported: () => void;
}) {
  if (tab === "other") {
    return (
      <div className="panel px-6 py-12 text-center">
        <span className="mx-auto grid size-10 place-items-center rounded-full bg-secondary">
          <CalendarOff className="size-4 text-muted-foreground" strokeWidth={1.6} />
        </span>
        <p className="mt-4 text-[14px] font-medium tracking-tight">
          Nothing set aside
        </p>
        <p className="mx-auto mt-1.5 max-w-[44ch] text-[12.5px] leading-relaxed text-muted-foreground">
          Every calendar entry synced so far looks like a real call.
        </p>
      </div>
    );
  }

  if (tab === "past") {
    return (
      <div className="panel px-6 py-12 text-center">
        <span className="mx-auto grid size-10 place-items-center rounded-full bg-secondary">
          <Mic className="size-4 text-muted-foreground" strokeWidth={1.6} />
        </span>
        <p className="mt-4 text-[14px] font-medium tracking-tight">
          No calls read yet
        </p>
        <p className="mx-auto mt-1.5 max-w-[46ch] text-[12.5px] leading-relaxed text-muted-foreground">
          Once the notetaker sits in on a call, or you paste a transcript in,
          it lands here with what Closingly made of it.
        </p>
        <div className="mt-5 flex justify-center">
          <ImportCallDialog onImported={onImported} />
        </div>
      </div>
    );
  }

  return (
    <div className="panel px-6 py-12 text-center">
      <span className="mx-auto grid size-10 place-items-center rounded-full bg-secondary">
        <CalendarX2 className="size-4 text-muted-foreground" strokeWidth={1.6} />
      </span>
      <p className="mt-4 text-[14px] font-medium tracking-tight">
        Nothing coming up
      </p>
      <p className="mx-auto mt-1.5 max-w-[46ch] text-[12.5px] leading-relaxed text-muted-foreground">
        Sync your calendar to pull in what&rsquo;s booked, or paste a transcript
        from a call that already happened.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Button
          onClick={onSync}
          disabled={syncing}
          variant="brand"
          size="lg"
          className="text-[12.5px] gap-2"
        >
          <RefreshCw
            className={cn("size-3.5", syncing && "animate-spin")}
            strokeWidth={1.6}
          />
          {syncing ? "Syncing…" : "Sync calendar"}
        </Button>
        <ImportCallDialog onImported={onImported} />
      </div>
    </div>
  );
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

function meetingKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    discovery: "Discovery",
    check_in: "Check-in",
    kickoff: "Kickoff",
    internal: "Internal",
    other: "Other",
  };
  return labels[kind] ?? kind;
}

function platformLabel(platform: string | null): string {
  const labels: Record<string, string> = {
    google_meet: "Google Meet",
    zoom: "Zoom",
    teams: "Microsoft Teams",
    other: "Call link",
  };
  return platform ? (labels[platform] ?? "Call link") : "Call link";
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function groupByDay(meetings: Meeting[]): Array<{ day: string; items: Meeting[] }> {
  const groups: Array<{ day: string; items: Meeting[] }> = [];

  for (const meeting of meetings) {
    const day = formatDay(meeting.starts_at);
    const current = groups[groups.length - 1];
    if (current?.day === day) current.items.push(meeting);
    else groups.push({ day, items: [meeting] });
  }

  return groups;
}

function formatDay(iso: string | null): string {
  if (!iso) return "No date";

  const date = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const yesterday = new Date(today.getTime() - 86_400_000);

  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();

  if (same(date, today)) return "Today";
  if (same(date, tomorrow)) return "Tomorrow";
  if (same(date, yesterday)) return "Yesterday";

  return date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  });
}
