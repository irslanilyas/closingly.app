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
import { MEETING_STATUS_LABELS, type Meeting } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { RefreshCw, Video, CalendarX2, FileUp, Loader2 } from "lucide-react";

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  // Query Supabase directly rather than through an API route — RLS already
  // scopes this to the current user, and it saves a server round trip.
  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("meetings")
      .select("*")
      .gte("starts_at", new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString())
      .order("starts_at", { ascending: true });

    if (!error && data) setMeetings(data as Meeting[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/calendar/sync", { method: "POST" });
      const body = await res.json();

      if (!res.ok) {
        if (body.error === "google_disconnected") {
          toast.error("Google access expired. Reconnect it in Settings.");
        } else {
          toast.error("Couldn't sync your calendar. Try again.");
        }
        return;
      }

      toast.success(
        body.synced === 0
          ? "No upcoming meetings found."
          : `Synced ${body.synced} meeting${body.synced === 1 ? "" : "s"}, ${body.with_links} with a call link.`
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
    setMeetings((prev) =>
      prev.map((m) => (m.id === meeting.id ? { ...m, agent_enabled: enabled } : m))
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
            `Only ${minutes} min of recording allowance left — too little to be worth starting. Check Settings.`
          );
        }

        const messages: Record<string, string> = {
          no_meeting_link: "That meeting has no call link to join.",
          meeting_passed: "That meeting has already started.",
          allowance_exhausted:
            "You've used your recording allowance. Check Settings.",
          schedule_failed:
            "Couldn't schedule the agent with Recall. Try again.",
        };
        throw new Error(messages[body.error] ?? "Couldn't update the agent.");
      }
    } catch (err) {
      setMeetings((prev) =>
        prev.map((m) =>
          m.id === meeting.id ? { ...m, agent_enabled: !enabled } : m
        )
      );
      toast.error(err instanceof Error ? err.message : "Couldn't update the agent.");
    } finally {
      setPending(null);
    }
  };

  const grouped = useMemo(() => groupByDay(meetings), [meetings]);
  const armed = meetings.filter((m) => m.agent_enabled).length;

  return (
    <AppShellClient>
      <PageHeader
        eyebrow="Meetings"
        title="Your calendar"
        description="Switch the agent on for a meeting and it will join, record, and turn the conversation into a deal."
      />

      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="text-[12.5px] text-muted-foreground tabular-nums">
          {loading
            ? " "
            : `${meetings.length} upcoming${armed > 0 ? ` · ${armed} with agent on` : ""}`}
        </div>
        <div className="flex items-center gap-2">
          <ImportCallDialog onImported={load} />
          <Button
            onClick={sync}
            disabled={syncing}
            variant="outline"
            className="h-9 text-[12.5px] gap-2 cursor-pointer"
          >
            <RefreshCw
              className={cn("size-3.5", syncing && "animate-spin")}
              strokeWidth={1.5}
            />
            {syncing ? "Syncing…" : "Sync calendar"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[68px] w-full rounded-md" />
          ))}
        </div>
      ) : meetings.length === 0 ? (
        <EmptyState onSync={sync} syncing={syncing} onImported={load} />
      ) : (
        <div className="space-y-8 stagger">
          {grouped.map(({ day, items }) => (
            <section key={day}>
              <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground mb-3 font-medium">
                {day}
              </div>
              <div className="rounded-lg border border-border bg-card divide-y divide-border overflow-hidden">
                {items.map((meeting) => (
                  <MeetingRow
                    key={meeting.id}
                    meeting={meeting}
                    pending={pending === meeting.id}
                    onToggle={(enabled) => toggleAgent(meeting, enabled)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </AppShellClient>
  );
}

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

  // A hand-imported call has no calendar event and no bot — that combination
  // only ever comes from the import dialog.
  const imported =
    !meeting.google_event_id && !meeting.recall_bot_id && !!meeting.transcript;
  const processing = meeting.status === "processing";
  const noAgentNeeded = imported || processing;

  return (
    <div className="flex items-center gap-4 px-4 py-3.5">
      <div className="w-[70px] shrink-0 text-[12.5px] tabular-nums text-muted-foreground">
        {formatTime(meeting.starts_at)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium truncate">
          {meeting.title ?? "Untitled meeting"}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[12px] text-muted-foreground">
          {imported ? (
            <>
              <FileUp className="size-3" strokeWidth={1.5} />
              <span>Imported transcript</span>
            </>
          ) : hasLink ? (
            <>
              <Video className="size-3" strokeWidth={1.5} />
              <span>{platformLabel(meeting.platform)}</span>
            </>
          ) : (
            <>
              <CalendarX2 className="size-3" strokeWidth={1.5} />
              <span>No call link</span>
            </>
          )}
          {meeting.attendees.length > 0 && (
            <span>· {meeting.attendees.length} attending</span>
          )}
          {meeting.deal_id && (
            <>
              <span>·</span>
              <Link
                href={`/pipeline/${meeting.deal_id}`}
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                View deal
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {processing ? (
          <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" strokeWidth={1.75} />
            Reading
          </span>
        ) : noAgentNeeded ? (
          // An imported call already happened — offering to send a bot to it
          // would be nonsense, so the control simply isn't there.
          <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground hidden sm:inline">
            {meeting.deal_id ? "Processed" : statusLabel(meeting.status)}
          </span>
        ) : (
          <>
            <span
              className={cn(
                "text-[11px] uppercase tracking-[0.1em] hidden sm:inline",
                meeting.agent_enabled
                  ? "text-[var(--accent-sage)] font-medium"
                  : "text-muted-foreground"
              )}
            >
              {meeting.agent_enabled ? "Agent on" : "Agent off"}
            </span>
            <Switch
              checked={meeting.agent_enabled}
              onCheckedChange={onToggle}
              disabled={pending || !canArm}
              aria-label={`Meeting agent for ${meeting.title ?? "meeting"}`}
            />
          </>
        )}
      </div>
    </div>
  );
}

/** Falls back to the raw value so an unfamiliar status still reads as something. */
function statusLabel(status: Meeting["status"]): string {
  return MEETING_STATUS_LABELS[status] ?? String(status).replace(/_/g, " ");
}

/**
 * The cold-start screen. Someone who just signed up has no calendar synced and
 * quite possibly no client call booked this week — telling them only to "sync
 * and wait" gives them nothing to do and nothing to judge the product by. So
 * importing a past call is offered here as an equal option, not a footnote.
 */
function EmptyState({
  onSync,
  syncing,
  onImported,
}: {
  onSync: () => void;
  syncing: boolean;
  onImported: () => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-14 text-center">
      <div className="text-[14px] font-medium">No meetings yet</div>
      <p className="mt-2 mx-auto max-w-[420px] text-[13px] text-muted-foreground leading-relaxed">
        Sync your Google Calendar to see upcoming calls here — meetings with a
        Meet, Zoom, or Teams link can have the agent switched on.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Button
          onClick={onSync}
          disabled={syncing}
          className="h-9 text-[12.5px] bg-[var(--accent-sage)] text-[var(--accent-sage-fg)] hover:bg-[var(--accent-sage)]/90 cursor-pointer"
        >
          {syncing ? "Syncing…" : "Sync calendar"}
        </Button>
        <ImportCallDialog onImported={onImported} />
      </div>
      <p className="mt-4 mx-auto max-w-[420px] text-[12px] text-muted-foreground/80 leading-relaxed">
        Don&rsquo;t have a call coming up? Import a transcript from a past one
        and you&rsquo;ll have a deal and a drafted proposal in about a minute.
      </p>
    </div>
  );
}

function groupByDay(meetings: Meeting[]) {
  const map = new Map<string, Meeting[]>();

  for (const meeting of meetings) {
    const day = formatDay(meeting.starts_at);
    const bucket = map.get(day);
    if (bucket) bucket.push(meeting);
    else map.set(day, [meeting]);
  }

  return Array.from(map, ([day, items]) => ({ day, items }));
}

function formatDay(iso: string | null): string {
  if (!iso) return "Undated";
  const date = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, tomorrow)) return "Tomorrow";

  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function platformLabel(platform: Meeting["platform"]): string {
  switch (platform) {
    case "google_meet":
      return "Google Meet";
    case "zoom":
      return "Zoom";
    case "teams":
      return "Microsoft Teams";
    default:
      return "Video call";
  }
}
