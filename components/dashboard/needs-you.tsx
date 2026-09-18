"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { KIND_LABELS, type FollowUpKind } from "@/lib/follow-ups/rules";
import {
  CalendarClock,
  Eye,
  Send,
  ArrowRight,
  Video,
  MicOff,
  Sparkles,
} from "lucide-react";

/**
 * The one band on the dashboard that answers "what do I do now".
 *
 * Everything else on this page is a summary of a state. This is a list of
 * actions, ordered by how much they cost to ignore: a call starting soon, a
 * client reading a proposal this minute, then whatever the follow-up rules
 * raised. Three items maximum from each source, because a command centre that
 * scrolls is a to-do list.
 */

const RECENTLY_OPENED_HOURS = 24;
const MAX_ROWS = 5;

interface Row {
  key: string;
  icon: "call" | "read" | "chase";
  title: string;
  detail: string;
  href: string;
  action: string;
  /** Only the top row is allowed the vivid accent. */
  urgent: boolean;
}

interface State {
  rows: Row[];
  nextCall: {
    id: string;
    title: string;
    startsAt: string;
    agentEnabled: boolean;
    dealId: string | null;
  } | null;
}

function timeUntil(iso: string): string {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (minutes < 0) return "in progress";
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function NeedsYou() {
  const [state, setState] = useState<State | null>(null);

  const read = useCallback(async (): Promise<State | null> => {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return null;

    const now = new Date();
    const recently = new Date(
      now.getTime() - RECENTLY_OPENED_HOURS * 3_600_000
    ).toISOString();

    const [{ data: meetings }, { data: followUps }, { data: notifications }] =
      await Promise.all([
        supabase
          .from("meetings")
          .select("id, title, starts_at, agent_enabled, deal_id, status")
          .eq("user_id", auth.user.id)
          .gte("starts_at", new Date(now.getTime() - 15 * 60_000).toISOString())
          .in("status", ["scheduled", "bot_scheduled", "recording"])
          .order("starts_at", { ascending: true })
          .limit(3),
        supabase
          .from("follow_ups")
          .select(
            "id, kind, reason, priority, deal_id, deals ( client_name, client_company, proposed_amount )"
          )
          .eq("user_id", auth.user.id)
          .eq("status", "open")
          .order("priority", { ascending: true })
          .limit(3),
        // A live read is the one thing worth interrupting for, and it is
        // already captured as a notification the moment it happens.
        supabase
          .from("notifications")
          .select("id, title, body, href, created_at")
          .eq("user_id", auth.user.id)
          .in("kind", ["proposal_opened", "proposal_reopened"])
          .gte("created_at", recently)
          .order("created_at", { ascending: false })
          .limit(2),
      ]);

    const rows: Row[] = [];

    const next = meetings?.[0];
    if (next?.starts_at) {
      rows.push({
        key: `call-${next.id}`,
        icon: "call",
        title: (next.title as string) ?? "Untitled call",
        detail: next.agent_enabled
          ? `Starts ${timeUntil(next.starts_at as string)}. The notetaker will join.`
          : `Starts ${timeUntil(next.starts_at as string)}. The notetaker is off for this one.`,
        href: "/meetings",
        action: next.agent_enabled ? "View" : "Switch it on",
        urgent: true,
      });
    }

    for (const n of notifications ?? []) {
      rows.push({
        key: `read-${n.id}`,
        icon: "read",
        title: n.title as string,
        detail: (n.body as string | null) ?? "",
        href: (n.href as string | null) ?? "/pipeline",
        action: "Open deal",
        urgent: rows.length === 0,
      });
    }

    for (const f of followUps ?? []) {
      const deal = (Array.isArray(f.deals) ? f.deals[0] : f.deals) as
        | { client_name: string | null; client_company: string | null; proposed_amount: number | null }
        | null;
      const who =
        deal?.client_company?.trim() || deal?.client_name?.trim() || "A deal";
      const amount =
        deal?.proposed_amount != null
          ? ` · ${formatCurrency(deal.proposed_amount)}`
          : "";

      rows.push({
        key: `follow-${f.id}`,
        icon: "chase",
        title: `${who}${amount}`,
        detail: f.reason as string,
        href: "/follow-ups",
        action: KIND_LABELS[f.kind as FollowUpKind],
        urgent: false,
      });
    }

    return {
      rows: rows.slice(0, MAX_ROWS),
      nextCall: next?.starts_at
        ? {
            id: next.id as string,
            title: (next.title as string) ?? "Untitled call",
            startsAt: next.starts_at as string,
            agentEnabled: next.agent_enabled as boolean,
            dealId: (next.deal_id as string | null) ?? null,
          }
        : null,
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    read().then((next) => {
      if (!cancelled && next) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [read]);

  // Nothing to show is a good day, not an empty state. Rendering a card that
  // says "nothing needs you" every morning would train people to skip the top
  // of the page, which is the one place attention is worth something.
  if (!state || state.rows.length === 0) return null;

  return (
    <section className="mb-8 sm:mb-9">
      <div className="label mb-2.5">Needs you</div>
      <div className="panel divide-y divide-border overflow-hidden">
        {state.rows.map((row) => (
          <Link
            key={row.key}
            href={row.href}
            className="group flex items-center gap-3 px-4 py-3 pointer-coarse:py-3.5 row-lift hover:bg-secondary/50"
          >
            <RowIcon icon={row.icon} urgent={row.urgent} />

            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-medium tracking-tight">
                {row.title}
              </div>
              {row.detail && (
                <div className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
                  {row.detail}
                </div>
              )}
            </div>

            <span className="hidden shrink-0 items-center gap-1 text-[12px] text-muted-foreground transition-colors group-hover:text-brand sm:inline-flex">
              {row.action}
              <ArrowRight className="size-3" strokeWidth={1.8} />
            </span>
            {/* No room for the action's words on a phone; the arrow still
                says the row goes somewhere. */}
            <ArrowRight
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground sm:hidden"
              strokeWidth={1.8}
            />
          </Link>
        ))}
      </div>
    </section>
  );
}

function RowIcon({ icon, urgent }: { icon: Row["icon"]; urgent: boolean }) {
  const Icon =
    icon === "call" ? CalendarClock : icon === "read" ? Eye : Send;

  return (
    <span
      aria-hidden
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-lg",
        urgent ? "bg-brand text-brand-fg" : "bg-secondary text-muted-foreground"
      )}
    >
      <Icon className="size-3.5" strokeWidth={1.7} />
    </span>
  );
}

/**
 * The next call, as a standing card. Separate from the list above because it
 * is the only thing on this page with a deadline attached to it.
 */
export function NextCallCard() {
  const [call, setCall] = useState<State["nextCall"] | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;

      const { data } = await supabase
        .from("meetings")
        .select("id, title, starts_at, agent_enabled, deal_id")
        .eq("user_id", auth.user.id)
        .gte("starts_at", new Date().toISOString())
        .in("status", ["scheduled", "bot_scheduled"])
        .order("starts_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      setCall(
        data?.starts_at
          ? {
              id: data.id as string,
              title: (data.title as string) ?? "Untitled call",
              startsAt: data.starts_at as string,
              agentEnabled: data.agent_enabled as boolean,
              dealId: (data.deal_id as string | null) ?? null,
            }
          : null
      );
      setLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) return null;

  if (!call) {
    return (
      <div className="panel p-4">
        <div className="label">Next call</div>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          Nothing on the calendar. Import a past call and Closingly will read it
          the same way.
        </p>
        <Link
          href="/meetings"
          className="mt-3 inline-flex items-center gap-1 text-[12.5px] text-brand hover:underline"
        >
          Go to meetings
          <ArrowRight className="size-3" strokeWidth={1.8} />
        </Link>
      </div>
    );
  }

  return (
    <div className="panel p-4">
      <div className="label">Next call</div>
      <div className="mt-2 text-[14px] font-medium leading-snug tracking-tight">
        {call.title}
      </div>
      <div className="mt-1 text-[12.5px] text-muted-foreground tabular-nums">
        {new Date(call.startsAt).toLocaleString(undefined, {
          weekday: "short",
          hour: "numeric",
          minute: "2-digit",
        })}
        {" · "}
        {timeUntil(call.startsAt)}
      </div>

      <div
        className={cn(
          "mt-3 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px]",
          call.agentEnabled
            ? "bg-brand-soft/60 text-foreground"
            : "bg-secondary text-muted-foreground"
        )}
      >
        {call.agentEnabled ? (
          <Video className="size-3.5 shrink-0 text-brand" strokeWidth={1.7} />
        ) : (
          <MicOff className="size-3.5 shrink-0" strokeWidth={1.7} />
        )}
        {call.agentEnabled
          ? "Notetaker will join and everyone will see it there."
          : "Notetaker is off. Nothing will be recorded."}
      </div>

      <Link
        href="/meetings"
        className="mt-3 inline-flex items-center gap-1 text-[12.5px] text-brand hover:underline"
      >
        {call.agentEnabled ? "Manage" : "Switch it on"}
        <ArrowRight className="size-3" strokeWidth={1.8} />
      </Link>
    </div>
  );
}

/** Shown on the dashboard's right column, under the next call. */
export function AskPrompt() {
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="size-3.5 text-brand" strokeWidth={1.7} />
        <span className="text-[13px] font-medium tracking-tight">
          Ask Closingly
        </span>
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
        Questions answered from your own calls and deals. What did they say
        about budget, which proposals are unread, what should you do next.
      </p>
      <p className="mt-2.5 text-[11.5px] text-muted-foreground">
        The blue button, bottom right, on any screen.
      </p>
    </div>
  );
}
