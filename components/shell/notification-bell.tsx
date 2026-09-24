"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  BellIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";

interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
}

/**
 * Polls rather than subscribes.
 *
 * Supabase realtime would be the obvious reach, but it means a websocket held
 * open on every tab for an event that arrives a few times a day. A 60-second
 * poll of a covered index is cheaper in every dimension that matters here, and
 * the one event people genuinely want instantly (a client opening a proposal)
 * is worth a minute's wait.
 */
const POLL_MS = 60_000;

function relative(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

export function NotificationBell() {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  // Never throws. A poll that fails (the laptop slept, the wifi dropped, a
  // deploy swapped the server mid-request) is not an error worth reporting:
  // the badge just stays as it was until the next one succeeds. Uncaught, each
  // of those used to land in Sentry as "TypeError: Failed to fetch".
  const read = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return null;
      return (await res.json()) as {
        notifications: NotificationRow[];
        unread: number;
      };
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    // Polls only while the tab is visible, and backs off after failures, so a
    // tab left open overnight costs nothing and a flaky network isn't hammered.
    const schedule = () => {
      clearTimeout(timer);
      if (cancelled || document.visibilityState !== "visible") return;
      const delay = Math.min(POLL_MS * 2 ** failures, 10 * POLL_MS);
      timer = setTimeout(pull, delay);
    };

    const pull = async () => {
      const next = await read();
      if (cancelled) return;
      if (next) {
        failures = 0;
        setItems(next.notifications);
        setUnread(next.unread);
      } else {
        failures = Math.min(failures + 1, 4);
      }
      schedule();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") pull();
      else clearTimeout(timer);
    };

    pull();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [read]);

  const markAll = async () => {
    setUnread(0);
    setItems((current) =>
      current.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() }))
    );
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
  };

  const markOne = async (id: string) => {
    setUnread((n) => Math.max(0, n - 1));
    setItems((current) =>
      current.map((n) =>
        n.id === id ? { ...n, read_at: new Date().toISOString() } : n
      )
    );
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={
            unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
          }
          className="relative grid size-10 lg:size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <BellIcon className="size-4" strokeWidth={1.6} />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute right-1.5 top-1.5 lg:right-1 lg:top-1 grid min-w-[15px] place-items-center rounded-full bg-brand-vivid px-1 text-[9.5px] font-semibold leading-[15px] text-white tabular-nums"
            >
              {unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        collisionPadding={8}
        className="w-[340px] max-w-[calc(100vw-16px)] p-0"
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <span className="text-[13px] font-medium tracking-tight">
            Notifications
          </span>
          {unread > 0 && (
            <button
              type="button"
              onClick={markAll}
              className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <CheckIcon className="size-3" strokeWidth={2.2} />
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-[min(380px,60dvh)] overflow-y-auto scrollbar-thin">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-[12.5px] text-muted-foreground leading-relaxed">
              Nothing yet. You&rsquo;ll hear from Closingly when a client opens
              a proposal or something needs chasing.
            </p>
          ) : (
            items.map((item) => {
              const unreadRow = !item.read_at;
              const content = (
                <>
                  <span
                    aria-hidden
                    className={cn(
                      "mt-[7px] size-1.5 shrink-0 rounded-full",
                      unreadRow ? "bg-brand-vivid" : "bg-transparent"
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] leading-snug">
                      {item.title}
                    </span>
                    {item.body && (
                      <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted-foreground">
                        {item.body}
                      </span>
                    )}
                    <span className="mt-1 block text-[11px] text-muted-foreground/80">
                      {relative(item.created_at)}
                    </span>
                  </span>
                </>
              );

              const className = cn(
                "flex w-full items-start gap-2 border-b border-border px-3 py-2.5 text-left transition-colors last:border-b-0",
                unreadRow ? "bg-brand-soft/40" : "bg-transparent",
                "hover:bg-secondary"
              );

              return item.href ? (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => {
                    setOpen(false);
                    if (unreadRow) markOne(item.id);
                  }}
                  className={className}
                >
                  {content}
                </Link>
              ) : (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => unreadRow && markOne(item.id)}
                  className={className}
                >
                  {content}
                </button>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
