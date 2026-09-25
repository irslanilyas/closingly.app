"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import {
  ArrowPathIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ExclamationTriangleIcon,
  LinkIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { ActionView, AskPart, LinkPart } from "@/lib/ask/parts";
import { AskText } from "./ask-text";
import { AskOrb } from "./ask-orb";
import type { UiMessage } from "./use-ask";

/* ── Steps ────────────────────────────────────────────────────────────── */

type Step = Extract<AskPart, { type: "step" }>;

function StepRow({ step }: { step: Step }) {
  return (
    <motion.li
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-center gap-2 text-[12.5px]"
    >
      <span className="grid size-4 place-items-center">
        {step.status === "running" ? (
          <Spinner className="size-3.5 text-brand" />
        ) : step.status === "done" ? (
          <motion.span initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 26 }}>
            <CheckIcon className="size-3.5 text-muted-foreground" strokeWidth={2.2} />
          </motion.span>
        ) : (
          <XMarkIcon className="size-3.5 text-destructive" strokeWidth={2.2} />
        )}
      </span>
      <span className={cn(step.status === "running" ? "text-foreground" : "text-muted-foreground")}>
        {step.label}
        {step.status === "running" && <span className="ask-ellipsis" aria-hidden />}
      </span>
    </motion.li>
  );
}

/** The work behind a reply: shown live, then folded into one line. */
function Steps({ steps, live }: { steps: Step[]; live: boolean }) {
  const [open, setOpen] = useState(false);
  if (!steps.length) return null;
  const running = steps.some((s) => s.status === "running");

  if (live && running) {
    return (
      <ul className="mb-3 space-y-1.5" aria-live="polite">
        {steps.map((step) => (
          <StepRow key={step.id} step={step} />
        ))}
      </ul>
    );
  }

  return (
    <div className="mb-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={open}
      >
        Looked at {steps.length} {steps.length === 1 ? "thing" : "things"}
        <ChevronDownIcon className={cn("size-3 transition-transform", open && "rotate-180")} strokeWidth={2} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="mt-1.5 space-y-1.5 overflow-hidden"
          >
            {steps.map((step) => (
              <StepRow key={step.id} step={step} />
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Action cards ─────────────────────────────────────────────────────── */

const RISK_ICON = { safe: PencilSquareIcon, external: LinkIcon, destructive: TrashIcon } as const;

export function ActionCard({
  action,
  onDecide,
}: {
  action: ActionView;
  onDecide: (decision: "confirm" | "cancel") => void;
}) {
  const Icon = RISK_ICON[action.risk];
  const destructive = action.risk === "destructive";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "my-3 overflow-hidden rounded-xl border bg-card transition-colors",
        action.status === "done" && "border-brand/35",
        action.status === "pending" && destructive && "border-destructive/35",
        (action.status === "cancelled" || action.status === "expired") && "opacity-70"
      )}
    >
      <div className="flex items-start gap-3 px-3.5 pt-3.5">
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-lg",
            action.status === "done"
              ? "bg-brand text-brand-fg"
              : destructive
                ? "bg-destructive/10 text-destructive"
                : "bg-brand-soft text-brand"
          )}
        >
          {action.status === "done" ? (
            <motion.span initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 480, damping: 22 }}>
              <CheckIcon className="size-4" strokeWidth={2.4} />
            </motion.span>
          ) : (
            <Icon className="size-4" strokeWidth={1.8} />
          )}
        </span>
        <div className="min-w-0 flex-1 pb-0.5">
          <p className="text-[13.5px] font-medium leading-snug">{action.title}</p>
          {action.detail && (
            <p className="mt-1 line-clamp-4 whitespace-pre-line text-[12.5px] leading-relaxed text-muted-foreground">
              {action.detail}
            </p>
          )}
        </div>
      </div>

      {!!action.fields?.length && (
        <dl className="mx-3.5 mt-3 divide-y divide-border rounded-lg border border-border bg-background/60 text-[12.5px]">
          {action.fields.map((f) => (
            <div key={f.label} className="grid grid-cols-[96px_1fr] items-baseline gap-2 px-3 py-2">
              <dt className="text-muted-foreground">{f.label}</dt>
              <dd className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                {f.before != null && f.before !== f.after && (
                  <>
                    <span className="text-muted-foreground line-through decoration-muted-foreground/50">{f.before}</span>
                    <ArrowRightIcon className="size-3 shrink-0 self-center text-muted-foreground" strokeWidth={2} />
                  </>
                )}
                <span className="font-medium text-foreground">{f.after}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-3 border-t border-border px-3.5 py-2.5">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={action.status}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={{ duration: 0.2 }}
            className="flex min-h-8 flex-wrap items-center gap-2"
          >
            {action.status === "pending" && (
              <>
                <Button
                  size="sm"
                  variant={destructive ? "destructive" : "brand"}
                  onClick={() => onDecide("confirm")}
                  className="gap-1.5"
                >
                  {destructive ? <TrashIcon className="size-3.5" strokeWidth={1.9} /> : <CheckIcon className="size-3.5" strokeWidth={2.2} />}
                  {destructive ? "Delete" : action.risk === "external" ? "Create link" : "Confirm"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onDecide("cancel")} className="text-muted-foreground">
                  Cancel
                </Button>
                {destructive && <span className="ml-auto text-[11.5px] text-destructive">Can&rsquo;t be undone</span>}
              </>
            )}
            {action.status === "running" && (
              <span className="inline-flex items-center gap-2 text-[12.5px] text-muted-foreground">
                <Spinner className="size-3.5" /> Working on it
              </span>
            )}
            {action.status === "done" && (
              <>
                <span className="text-[12.5px] text-foreground">{action.result?.message ?? "Done."}</span>
                {action.result?.href && <ResultLink href={action.result.href} />}
              </>
            )}
            {action.status === "failed" && (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] text-destructive">
                <ExclamationTriangleIcon className="size-3.5" strokeWidth={1.9} />
                {action.error ?? "That didn't work. Nothing was changed."}
              </span>
            )}
            {action.status === "cancelled" && <span className="text-[12.5px] text-muted-foreground">Cancelled. Nothing changed.</span>}
            {action.status === "expired" && (
              <span className="text-[12.5px] text-muted-foreground">This expired. Ask again if you still want it.</span>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function ResultLink({ href }: { href: string }) {
  const external = href.startsWith("/p/");
  if (external) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="ml-auto gap-1.5"
        onClick={async () => {
          const url = `${window.location.origin}${href}`;
          try {
            await navigator.clipboard.writeText(url);
            toast.success("Link copied.");
          } catch {
            toast(url);
          }
        }}
      >
        <LinkIcon className="size-3.5" strokeWidth={1.9} />
        Copy link
      </Button>
    );
  }
  return (
    <Button size="sm" variant="outline" asChild className="ml-auto gap-1">
      <Link href={href}>
        Open
        <ArrowUpRightIcon className="size-3" strokeWidth={2} />
      </Link>
    </Button>
  );
}

/* ── Buttons the agent hands over ─────────────────────────────────────── */

function LinkButton({ link, onNavigate }: { link: LinkPart; onNavigate: () => void }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  if (link.run === "sync_calendar") {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={running}
        className="gap-1.5"
        onClick={async () => {
          setRunning(true);
          const res = await fetch("/api/calendar/sync", { method: "POST" }).catch(() => null);
          setRunning(false);
          if (res?.ok) toast.success("Calendar refreshed.");
          else toast.error(res?.status === 401 ? "Google needs reconnecting in Settings." : "Couldn't refresh the calendar.");
        }}
      >
        {running ? <Spinner className="size-3.5" /> : <ArrowPathIcon className="size-3.5" strokeWidth={1.9} />}
        {link.label}
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="gap-1.5"
      onClick={() => {
        if (!link.href) return;
        router.push(link.href);
        onNavigate();
      }}
    >
      {link.label}
      <ArrowUpRightIcon className="size-3" strokeWidth={2} />
    </Button>
  );
}

/* ── One message ──────────────────────────────────────────────────────── */

export function AskMessageView({
  message,
  onDecide,
  onNavigate,
}: {
  message: UiMessage;
  onDecide: (action: ActionView, decision: "confirm" | "cancel") => void;
  onNavigate: () => void;
}) {
  if (message.role === "user") {
    const text = message.parts.find((p) => p.type === "text");
    return (
      <motion.div
        initial={message.live ? { opacity: 0, y: 6 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="flex justify-end"
      >
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-secondary px-3.5 py-2 text-[13.5px] leading-relaxed text-secondary-foreground">
          {text?.type === "text" ? text.text : message.content}
        </p>
      </motion.div>
    );
  }

  const steps = message.parts.filter((p): p is Step => p.type === "step");
  const links = message.parts.filter((p): p is LinkPart => p.type === "link");
  const body = message.parts.filter((p) => p.type === "text" || p.type === "action");
  const waiting = message.streaming && body.length === 0 && !steps.some((s) => s.status === "running");

  return (
    <div>
      <Steps steps={steps} live={!!message.streaming} />

      {waiting && (
        <div className="flex items-center gap-2.5 py-1 text-[12.5px] text-muted-foreground" aria-live="polite">
          <AskOrb size={18} state="thinking" />
          Thinking<span className="ask-ellipsis" aria-hidden />
        </div>
      )}

      {body.map((part, i) =>
        part.type === "text" ? (
          <AskText key={i} text={part.text} animate={!!message.live} />
        ) : part.type === "action" ? (
          <ActionCard key={part.action.id} action={part.action} onDecide={(d) => onDecide(part.action, d)} />
        ) : null
      )}

      {links.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="mt-3 flex flex-wrap gap-2"
        >
          {links.map((link, i) => (
            <LinkButton key={i} link={link} onNavigate={onNavigate} />
          ))}
        </motion.div>
      )}
    </div>
  );
}
