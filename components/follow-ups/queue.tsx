"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import { PRIORITY_LABELS, KIND_LABELS, type FollowUpKind } from "@/lib/follow-ups/rules";
import { STAGE_LABELS, type DealStage } from "@/lib/types";
import {
  ArrowUturnLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  InboxIcon,
  PaperAirplaneIcon,
  SparklesIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Spinner } from "@/components/ui/spinner";
import { RevealText } from "@/components/ui/reveal-text";

interface DealSummary {
  id: string;
  client_name: string | null;
  client_company: string | null;
  client_email: string | null;
  stage: DealStage;
  proposed_amount: number | null;
}

interface FollowUpRow {
  id: string;
  deal_id: string | null;
  kind: FollowUpKind;
  status: string;
  reason: string;
  priority: 1 | 2 | 3;
  due_at: string;
  draft_subject: string | null;
  draft_body: string | null;
  drafted_at: string | null;
  sent_at: string | null;
  source: string;
  created_at: string;
  deals: DealSummary | DealSummary[] | null;
}

const SNOOZE_OPTIONS = [
  { value: "tomorrow", label: "Tomorrow" },
  { value: "three_days", label: "In 3 days" },
  { value: "next_week", label: "Next week" },
  { value: "two_weeks", label: "In 2 weeks" },
];

function dealOf(row: FollowUpRow): DealSummary | null {
  if (!row.deals) return null;
  return Array.isArray(row.deals) ? (row.deals[0] ?? null) : row.deals;
}

function nameOf(deal: DealSummary | null): string {
  return (
    deal?.client_company?.trim() || deal?.client_name?.trim() || "Unnamed deal"
  );
}

/**
 * The work queue.
 *
 * Built around one claim: the message is already written when you arrive. So
 * the row opens straight into an editable draft rather than a detail page, and
 * the only decisions left are send, change it, or not now.
 */
export function FollowUpQueue() {
  const [tab, setTab] = useState<"open" | "done">("open");
  const [openId, setOpenId] = useState<string | null>(null);

  // Cached against the tab it came from, so switching tabs shows the skeleton
  // as a matter of rendering rather than by resetting state inside an effect —
  // and stale rows from the previous tab can never flash on screen.
  const [cache, setCache] = useState<{
    tab: "open" | "done";
    rows: FollowUpRow[];
  } | null>(null);

  const rows = cache?.tab === tab ? cache.rows : null;

  const load = useCallback(async (which: "open" | "done") => {
    const res = await fetch(`/api/follow-ups?status=${which}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { follow_ups: FollowUpRow[] };
    return body.follow_ups;
  }, []);

  useEffect(() => {
    let cancelled = false;
    load(tab).then((next) => {
      if (!cancelled && next) setCache({ tab, rows: next });
    });
    return () => {
      cancelled = true;
    };
  }, [tab, load]);

  const refresh = useCallback(() => {
    load(tab).then((next) => next && setCache({ tab, rows: next }));
  }, [tab, load]);

  const grouped = useMemo(() => {
    const buckets = new Map<1 | 2 | 3, FollowUpRow[]>();
    for (const row of rows ?? []) {
      const list = buckets.get(row.priority) ?? [];
      list.push(row);
      buckets.set(row.priority, list);
    }
    return [1, 2, 3]
      .map((p) => ({ priority: p as 1 | 2 | 3, items: buckets.get(p as 1 | 2 | 3) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [rows]);

  return (
    <div>
      <div className="flex items-center gap-1 mb-6">
        {(["open", "done"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              "px-3 py-1.5 pointer-coarse:py-2.5 rounded-lg text-[13px] transition-colors",
              tab === value
                ? "bg-secondary text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
            )}
          >
            {value === "open" ? "Waiting on you" : "Handled"}
          </button>
        ))}
      </div>

      {rows === null ? (
        <QueueSkeleton />
      ) : rows.length === 0 ? (
        <EmptyQueue tab={tab} />
      ) : (
        <div className="space-y-8">
          {grouped.map(({ priority, items }) => (
            <section key={priority}>
              {tab === "open" && (
                <div className="label mb-2.5">
                  {PRIORITY_LABELS[priority]}
                  <span className="ml-2 normal-case tracking-normal text-muted-foreground/70">
                    {items.length}
                  </span>
                </div>
              )}
              <div className="space-y-2">
                {items.map((row) => (
                  <FollowUpCard
                    key={row.id}
                    row={row}
                    expanded={openId === row.id}
                    onToggle={() =>
                      setOpenId((current) => (current === row.id ? null : row.id))
                    }
                    onChanged={refresh}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function FollowUpCard({
  row,
  expanded,
  onToggle,
  onChanged,
}: {
  row: FollowUpRow;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const deal = dealOf(row);
  const [subject, setSubject] = useState(row.draft_subject ?? "");
  const [body, setBody] = useState(row.draft_body ?? "");
  const [busy, setBusy] = useState<null | "draft" | "send" | "action">(null);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  // A fresh draft plays in for a moment, then becomes the editor.
  const [revealing, setRevealing] = useState(false);

  const handled = row.status !== "open" && row.status !== "snoozed";

  const act = async (payload: Record<string, unknown>, note: string) => {
    setBusy("action");
    try {
      const res = await fetch(`/api/follow-ups/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      toast.success(note);
      onChanged();
    } catch {
      toast.error("That didn't stick. Try again.");
    } finally {
      setBusy(null);
      setSnoozeOpen(false);
    }
  };

  const draft = async () => {
    setBusy("draft");
    try {
      const res = await fetch(`/api/follow-ups/${row.id}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error();
      const next = (await res.json()) as {
        draft_subject: string;
        draft_body: string;
      };
      setSubject(next.draft_subject);
      setBody(next.draft_body);
      setRevealing(true);
      setTimeout(() => setRevealing(false), 1600);
    } catch {
      toast.error("Couldn't write that one. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    if (!deal?.client_email) {
      toast.error("No email address on this deal. Add one on the deal page.");
      return;
    }
    setBusy("send");
    try {
      const res = await fetch(`/api/follow-ups/${row.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message ?? "Couldn't send.");
      toast.success(`Sent to ${deal.client_email}.`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className={cn(
        "panel overflow-hidden transition-colors",
        expanded && "border-brand/40"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 py-3.5 pointer-coarse:py-4 flex items-start gap-3 row-lift hover:bg-secondary/40"
      >
        <span
          aria-hidden
          className={cn(
            "mt-1.5 size-1.5 shrink-0 rounded-full",
            handled
              ? "bg-border"
              : row.priority === 1
                ? "bg-brand-vivid"
                : row.priority === 2
                  ? "bg-clay"
                  : "bg-border"
          )}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[13.5px] font-medium">
              {nameOf(deal)}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {KIND_LABELS[row.kind]}
            </span>
            {deal?.proposed_amount != null && (
              <span className="text-[11.5px] text-muted-foreground tabular-nums">
                {formatCurrency(deal.proposed_amount)}
              </span>
            )}
            {deal && (
              <span className="text-[11.5px] text-muted-foreground">
                {STAGE_LABELS[deal.stage]}
              </span>
            )}
          </div>
          <p className="mt-1 text-[12.5px] text-muted-foreground leading-relaxed">
            {row.reason}
          </p>
          {row.sent_at && (
            <p className="mt-1 text-[11.5px] text-brand">
              Sent {new Date(row.sent_at).toLocaleDateString()}
            </p>
          )}
        </div>

        <ChevronDownIcon
          className={cn(
            "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180"
          )}
          strokeWidth={1.6}
        />
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-4 resolve">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="label">
                {row.drafted_at ? "Drafted for you" : "No draft yet"}
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={draft}
                  disabled={busy !== null}
                  className="text-[12px] gap-1.5"
                >
                  {busy === "draft" ? (
                    <Spinner className="" />
                  ) : (
                    <SparklesIcon strokeWidth={1.6} />
                  )}
                  {row.drafted_at ? "Rewrite" : "Write it"}
                </Button>
                {body && <CopyButton text={`Subject: ${subject}\n\n${body}`} />}
              </div>
            </div>

            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="h-9 text-[13px]"
            />
            {busy === "draft" ? (
              <div className="grid min-h-[150px] place-items-center rounded-lg border border-dashed border-border">
                <span className="shimmer-text text-[13px]">Writing it from the deal…</span>
              </div>
            ) : revealing ? (
              <button
                type="button"
                onClick={() => setRevealing(false)}
                className="block min-h-[150px] w-full rounded-lg border border-input px-3 py-2 text-left text-[13px] leading-relaxed"
              >
                <RevealText text={body} ripple />
              </button>
            ) : (
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write the message, or let Closingly draft it from the deal."
                className="min-h-[150px] text-[13px] leading-relaxed"
              />
            )}

            {deal?.client_email ? (
              <p className="text-[11.5px] text-muted-foreground">
                Sends from your Gmail to{" "}
                <span className="text-foreground">{deal.client_email}</span>, so
                it lands in the thread they already have.
              </p>
            ) : (
              <p className="text-[11.5px] text-muted-foreground">
                No email on this deal yet. Add one on{" "}
                {deal ? (
                  <Link href={`/pipeline/${deal.id}`} className="text-brand underline">
                    the deal page
                  </Link>
                ) : (
                  "the deal page"
                )}{" "}
                to send from here, or copy the message above.
              </p>
            )}
          </div>

          {!handled && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                variant="brand"
                size="sm"
                onClick={send}
                disabled={busy !== null || !body.trim() || !deal?.client_email}
                className="text-[12.5px] gap-1.5"
              >
                {busy === "send" ? (
                  <Spinner className="" />
                ) : (
                  <PaperAirplaneIcon strokeWidth={1.7} />
                )}
                Send it
              </Button>

              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSnoozeOpen((v) => !v)}
                  disabled={busy !== null}
                  className="text-[12.5px] gap-1.5"
                >
                  <ClockIcon strokeWidth={1.7} />
                  Not now
                </Button>
                {snoozeOpen && (
                  <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-lg border border-border bg-popover p-1 shadow-float">
                    {SNOOZE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          act(
                            { action: "snooze", snooze: option.value },
                            `Back ${option.label.toLowerCase()}.`
                          )
                        }
                        className="w-full rounded-md px-2 py-1.5 pointer-coarse:py-2.5 text-left text-[12.5px] hover:bg-secondary"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => act({ action: "done" }, "Marked handled.")}
                disabled={busy !== null}
                className="text-[12.5px] gap-1.5 text-muted-foreground"
              >
                <CheckIcon strokeWidth={1.8} />
                Handled elsewhere
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => act({ action: "dismiss" }, "Dismissed.")}
                disabled={busy !== null}
                className="text-[12.5px] gap-1.5 text-muted-foreground"
              >
                <XMarkIcon strokeWidth={1.8} />
                Not worth it
              </Button>
            </div>
          )}

          {handled && (
            <div className="mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => act({ action: "reopen" }, "Back in the queue.")}
                disabled={busy !== null}
                className="text-[12.5px] gap-1.5"
              >
                <ArrowUturnLeftIcon strokeWidth={1.7} />
                Put it back
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QueueSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="panel px-4 py-3.5">
          <div className="h-3.5 w-40 rounded-[3.2px] bg-muted animate-pulse" />
          <div className="mt-2 h-3 w-full max-w-[420px] rounded-[3.2px] bg-muted animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function EmptyQueue({ tab }: { tab: "open" | "done" }) {
  return (
    <div className="panel px-6 py-12 text-center">
      <span className="mx-auto grid size-10 place-items-center rounded-full bg-secondary">
        <InboxIcon className="size-4 text-muted-foreground" strokeWidth={1.6} />
      </span>
      <p className="mt-4 text-[14px] font-medium">
        {tab === "open" ? "Nothing needs chasing" : "Nothing handled yet"}
      </p>
      <p className="mx-auto mt-1.5 max-w-[42ch] text-[12.5px] text-muted-foreground leading-relaxed">
        {tab === "open"
          ? "Closingly watches your deals for proposals that go unopened, conversations that stall, and clients who read and go quiet. When one of those happens it lands here with the message already written."
          : "Follow-ups you send, dismiss or handle elsewhere are kept here."}
      </p>
    </div>
  );
}
