"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRightIcon,
  ChatBubbleLeftRightIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  FolderArrowDownIcon,
  SparklesIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { Deal } from "@/lib/types";
import { TYPICAL_MINUTES } from "@/lib/meetings/progress";
import {
  callActivityKey,
  phaseOf,
  useCallActivity,
  useDismissedCalls,
  type CallActivity,
  type CallPhase,
} from "./use-call-activity";

/* ── The relay ────────────────────────────────────────────────────────────
   A call on its way to becoming a deal passes four stations. Done ones fill,
   the current one holds a light travelling toward the next, so progress is
   something you can watch rather than a spinner you wait on.              */

const STATIONS = [
  { label: "Transcript", doing: "Recall is writing up what was said." },
  { label: "Reading", doing: "Finding what they need, their budget and their timeline." },
  { label: "Drafting", doing: "Writing the proposal and working out a price." },
  { label: "Ready", doing: "" },
] as const;

const HEADLINES = ["Collecting the transcript", "Reading the call", "Drafting the proposal", "Ready"];

const KIND_LABEL: Record<string, string> = {
  check_in: "a check-in",
  kickoff: "a kickoff",
  internal: "an internal meeting",
  other: "a general conversation",
};

function stationOf(call: CallActivity, phase: CallPhase): number {
  if (phase.kind === "ready") return 3;
  if (phase.kind !== "processing") return 0;
  const index = { queued: 0, transcript: 0, reading: 1, writing: 2, done: 3, failed: 0 }[phase.stage];
  // An import arrives with its transcript; its first station is already done.
  return call.imported ? Math.max(1, index) : index;
}

function useNow(everyMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

function Relay({ active, complete }: { active: number; complete: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative mt-5" role="img" aria-label={`Step ${Math.min(active + 1, 4)} of 4: ${STATIONS[active].label}`}>
      <div className="absolute left-[12.5%] right-[12.5%] top-[9px] h-[2px] rounded-full bg-border" />
      <motion.div
        className="absolute left-[12.5%] top-[9px] h-[2px] rounded-full bg-brand"
        initial={false}
        animate={{ width: `${active * 25}%` }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      />
      {!complete && active < 3 && (
        <div
          className="absolute top-[8px] h-[4px] overflow-hidden rounded-full"
          style={{ left: `${12.5 + active * 25}%`, width: "25%" }}
          aria-hidden
        >
          {!reduce && <div className="relay-comet absolute inset-y-0 w-1/2" />}
        </div>
      )}
      <ol className="relative grid grid-cols-4">
        {STATIONS.map((station, i) => {
          const done = i < active || complete;
          const current = i === active && !complete;
          return (
            <li key={station.label} className="flex flex-col items-center gap-2">
              <span
                className={cn(
                  "relative grid size-5 place-items-center rounded-full border bg-card transition-colors duration-300",
                  done && "border-brand bg-brand text-brand-fg",
                  current && "border-2 border-brand",
                  !done && !current && "border-border"
                )}
              >
                <AnimatePresence initial={false}>
                  {done && (
                    <motion.span
                      key="check"
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 520, damping: 26 }}
                    >
                      <CheckIcon className="size-3" strokeWidth={2.8} />
                    </motion.span>
                  )}
                </AnimatePresence>
                {current && (
                  <>
                    <span className="size-1.5 rounded-full bg-brand" />
                    {!reduce && <span className="relay-pulse absolute inset-[-5px] rounded-full border border-brand/50" />}
                  </>
                )}
              </span>
              <span
                className={cn(
                  "text-[11.5px] transition-colors",
                  current ? "font-medium text-foreground" : done ? "text-muted-foreground" : "text-muted-foreground/70",
                  !current && "max-sm:sr-only"
                )}
              >
                {station.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Five bars keeping time with a call that is still going. */
function LiveBars() {
  return (
    <span className="flex h-4 items-end gap-[3px]" aria-hidden>
      {[0.55, 1, 0.7, 0.9, 0.45].map((h, i) => (
        <span
          key={i}
          className="live-bar w-[3px] rounded-full bg-brand"
          style={{ height: `${h * 100}%`, animationDelay: `${i * 110}ms` }}
        />
      ))}
    </span>
  );
}

async function post(url: string, body: unknown) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
}

/**
 * One call, from "the bot just left" to "your deal is ready", in a single
 * card that changes state in place rather than being replaced.
 */
export function CallProgressCard({ call, onDismiss }: { call: CallActivity; onDismiss: () => void }) {
  const qc = useQueryClient();
  const now = useNow();
  const phase = phaseOf(call, now);
  const [busy, setBusy] = useState<null | "retry" | "force" | "attach">(null);
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const active = stationOf(call, phase);
  const settled = phase.kind === "ready" || phase.kind === "not_sales" || phase.kind === "failed";

  const since = (iso: string | null | undefined) =>
    iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "just now";
  const meta =
    phase.kind === "recording"
      ? "Live now"
      : phase.kind === "processing"
        ? `${call.imported ? "Imported" : "Ended"} ${formatDistanceToNow(phase.startedAt, { addSuffix: true })}`
        : `Finished ${since(call.progress?.stage_at ?? call.updated_at)}`;

  const rerun = async (force: boolean) => {
    setBusy(force ? "force" : "retry");
    const res = await post(`/api/meetings/${call.id}/retry`, { force });
    setBusy(null);
    if (!res?.ok) {
      toast.error(res?.status === 429 ? "That's a lot of retries. Give it a few minutes." : "Couldn't start that again.");
      return;
    }
    toast.success(force ? "Making the deal from this call." : "Trying again.");
    qc.invalidateQueries({ queryKey: callActivityKey });
  };

  const loadDeals = async () => {
    if (deals) return;
    const res = await fetch("/api/deals").catch(() => null);
    const body = res?.ok ? ((await res.json()) as { deals: Deal[] }) : { deals: [] };
    setDeals(body.deals.filter((d) => d.stage !== "lost").slice(0, 25));
  };

  const attach = async (deal: Deal) => {
    setBusy("attach");
    const res = await post(`/api/meetings/${call.id}/attach`, { deal_id: deal.id });
    setBusy(null);
    if (!res?.ok) {
      toast.error("Couldn't file the call there.");
      return;
    }
    toast.success(`Filed under ${deal.client_company || deal.client_name || "that deal"}.`);
    qc.invalidateQueries({ queryKey: callActivityKey });
    onDismiss();
  };

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.18 } }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "panel relative overflow-hidden px-4 py-4 sm:px-5",
        phase.kind === "ready" && "border-brand/35"
      )}
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {phase.kind === "recording" ? (
              <LiveBars />
            ) : phase.kind === "processing" ? (
              <span className="relative grid size-2 place-items-center" aria-hidden>
                <span className="relay-pulse absolute size-2 rounded-full bg-brand/40" />
                <span className="size-1.5 rounded-full bg-brand" />
              </span>
            ) : null}
            <h3 className="truncate text-[14.5px] font-medium">{call.title}</h3>
          </div>
          <p className="mt-0.5 text-[12px] text-muted-foreground">{meta}</p>
        </div>
        {settled && (
          <Button variant="ghost" size="icon-sm" onClick={onDismiss} aria-label="Hide this call" className="-mr-1.5 -mt-1 text-muted-foreground">
            <XMarkIcon className="size-4" strokeWidth={1.8} />
          </Button>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={phase.kind === "processing" ? `processing-${active}` : phase.kind}
          initial={{ opacity: 0, filter: "blur(3px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        >
          {phase.kind === "recording" && (
            <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
              Closingly Notetaker is on the call. The moment it ends, the write-up starts here on its own.
            </p>
          )}

          {phase.kind === "processing" && (
            <>
              <p className="mt-3 text-[15px] font-medium leading-snug">{HEADLINES[active]}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                {phase.stage === "queued" && !call.imported
                  ? "Recall finishes the transcript a minute or two after a call ends."
                  : STATIONS[active].doing}
              </p>
            </>
          )}

          {phase.kind === "ready" && (
            <div className="mt-3 flex items-start gap-3">
              <span className="relative mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-brand text-brand-fg">
                <CheckIcon className="size-4" strokeWidth={2.4} />
                <span className="ready-ring absolute inset-0 rounded-full border-2 border-brand" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-medium leading-snug">
                  Proposal ready for {call.deal_name ?? call.title}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  Drafted from the call. The deal is in your pipeline under Lead.
                </p>
              </div>
            </div>
          )}

          {phase.kind === "not_sales" && (
            <div className="mt-3 flex items-start gap-3">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground">
                <ChatBubbleLeftRightIcon className="size-4" strokeWidth={1.7} />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-medium leading-snug">
                  This looked like {KIND_LABEL[phase.meetingKind ?? "other"] ?? KIND_LABEL.other}, not a sales call
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  So nothing was created. If it was a sales conversation, make the deal anyway, or file the call
                  under a deal you already have.
                </p>
              </div>
            </div>
          )}

          {phase.kind === "failed" && (
            <div className="mt-3 flex items-start gap-3">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
                <ExclamationTriangleIcon className="size-4" strokeWidth={1.8} />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-medium leading-snug">Couldn&rsquo;t finish this call</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{phase.error}</p>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {(phase.kind === "processing" || phase.kind === "ready") && (
        <Relay active={active} complete={phase.kind === "ready"} />
      )}

      {phase.kind === "processing" && (
        <p className="mt-4 border-t border-border pt-3 text-[12px] leading-relaxed text-muted-foreground">
          {phase.slow
            ? "Taking longer than usual. Long calls can take Recall up to 15 minutes to transcribe, and nothing is lost while it waits."
            : `Usually ${TYPICAL_MINUTES.low} to ${TYPICAL_MINUTES.high} minutes in all. Leave this page if you like; you'll get a notification when it's ready.`}
        </p>
      )}

      {phase.kind === "ready" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="brand" size="sm" asChild className="gap-1.5">
            <Link href={`/pipeline/${phase.dealId}`}>
              Open the deal
              <ArrowRightIcon className="size-3.5" strokeWidth={2} />
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/pipeline">See it in the pipeline</Link>
          </Button>
        </div>
      )}

      {phase.kind === "not_sales" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => rerun(true)} disabled={busy !== null} className="gap-1.5">
            {busy === "force" ? <Spinner className="size-3.5" /> : <SparklesIcon className="size-3.5" strokeWidth={1.8} />}
            Make a deal anyway
          </Button>
          <DropdownMenu onOpenChange={(open) => open && loadDeals()}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" disabled={busy !== null} className="gap-1.5">
                {busy === "attach" ? <Spinner className="size-3.5" /> : <FolderArrowDownIcon className="size-3.5" strokeWidth={1.8} />}
                File under a deal
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 w-60 overflow-y-auto">
              <DropdownMenuLabel className="text-[11.5px] text-muted-foreground">Your deals</DropdownMenuLabel>
              {deals === null ? (
                <div className="flex justify-center py-3">
                  <Spinner className="size-4 text-muted-foreground" />
                </div>
              ) : deals.length === 0 ? (
                <p className="px-2 py-2 text-[12.5px] text-muted-foreground">No deals to file it under yet.</p>
              ) : (
                deals.map((deal) => (
                  <DropdownMenuItem key={deal.id} onSelect={() => attach(deal)} className="text-[13px]">
                    <span className="truncate">{deal.client_company || deal.client_name || "Untitled deal"}</span>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {phase.kind === "failed" && (
        <div className="mt-4">
          <Button variant="outline" size="sm" onClick={() => rerun(false)} disabled={busy !== null} className="gap-1.5">
            {busy === "retry" && <Spinner className="size-3.5" />}
            Try again
          </Button>
        </div>
      )}
    </motion.article>
  );
}

/** The dashboard's "just finished" stack. Renders nothing when there is nothing live or recent. */
export function JustFinished() {
  const { data } = useCallActivity();
  const { dismissed, dismiss } = useDismissedCalls();
  const calls = (data ?? []).filter((call) => !dismissed.has(call.id));

  return (
    <AnimatePresence initial={false}>
      {calls.length > 0 && (
        <motion.section
          key="just-finished"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          aria-label="Calls in progress"
          className="mb-6 overflow-hidden sm:mb-8"
        >
          <div className="grid items-start gap-3 lg:grid-cols-2">
            <AnimatePresence initial={false} mode="popLayout">
              {calls.map((call) => (
                <CallProgressCard key={call.id} call={call} onDismiss={() => dismiss(call.id)} />
              ))}
            </AnimatePresence>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

/**
 * A call still being written up, standing in the Lead column where its deal
 * will land. Replaced by the real card the moment the deal exists.
 */
export function PendingDealCards({ compact = true }: { compact?: boolean }) {
  const { data } = useCallActivity();
  const now = useNow();
  const pending = (data ?? []).filter((call) => call.status === "processing" || call.status === "recording");
  if (pending.length === 0) return null;

  return (
    <>
      {pending.map((call) => {
        const phase = phaseOf(call, now);
        const active = stationOf(call, phase);
        return (
          <Link
            key={call.id}
            href="/"
            className={cn(
              "block rounded-lg border border-dashed border-brand/45 bg-brand-soft/35 p-3 transition-colors hover:bg-brand-soft/60",
              !compact && "panel border-solid"
            )}
          >
            <div className="flex items-center gap-2">
              {phase.kind === "recording" ? <LiveBars /> : <Spinner className="size-3.5 text-brand" />}
              <span className="truncate text-[13px] font-medium">{call.title}</span>
            </div>
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              {phase.kind === "recording" ? "Recording now" : `${HEADLINES[active]}…`}
            </p>
            {phase.kind === "processing" && (
              <div className="mt-2.5 flex gap-1" aria-hidden>
                {STATIONS.map((station, i) => (
                  <span
                    key={station.label}
                    className={cn(
                      "h-1 flex-1 rounded-full",
                      i < active ? "bg-brand" : i === active ? "relay-segment bg-brand/30" : "bg-border"
                    )}
                  />
                ))}
              </div>
            )}
          </Link>
        );
      })}
    </>
  );
}
