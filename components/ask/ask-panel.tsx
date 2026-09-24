"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowPathIcon,
  ArrowUpIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  BoltIcon,
  ChatBubbleLeftEllipsisIcon,
  CheckIcon,
  ChevronDownIcon,
  DocumentMagnifyingGlassIcon,
  EyeSlashIcon,
  PencilSquareIcon,
  PlayCircleIcon,
  PlusIcon,
  RocketLaunchIcon,
  StopIcon,
  TrashIcon,
  UserPlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Icon } from "@/lib/icon";
import { AskMark } from "./ask-mark";
import { AskMessageView } from "./ask-message";
import { useAsk, type AskContext, type AskMode } from "./use-ask";

interface Suggestion {
  icon: Icon;
  title: string;
  hint: string;
  prompt: string;
}

const GENERAL: Suggestion[] = [
  { icon: BoltIcon, title: "What needs me today?", hint: "Deals going quiet and follow-ups due", prompt: "What needs me today?" },
  { icon: PlayCircleIcon, title: "Show me how Closingly works", hint: "A short tour of the whole loop", prompt: "Show me how Closingly works." },
  { icon: EyeSlashIcon, title: "Which proposals haven't been opened?", hint: "Sent, and still unread", prompt: "Which proposals haven't been opened yet?" },
  { icon: UserPlusIcon, title: "Add a deal", hint: "For a client with no recorded call", prompt: "Add a new deal for " },
  { icon: ArrowPathIcon, title: "Refresh my calendar", hint: "Pull in the latest calls", prompt: "Refresh my calendar." },
];

const ON_DEAL: Suggestion[] = [
  { icon: RocketLaunchIcon, title: "What should I do next here?", hint: "Grounded in this deal's history", prompt: "What should I do next on this deal?" },
  { icon: DocumentMagnifyingGlassIcon, title: "Catch me up on this deal", hint: "The call, the proposal, what they read", prompt: "Catch me up on this deal." },
  { icon: ChatBubbleLeftEllipsisIcon, title: "Queue a follow-up", hint: "With the reason it's needed", prompt: "Queue a follow-up for this deal." },
  { icon: PencilSquareIcon, title: "Add a note", hint: "Private unless you say otherwise", prompt: "Add a note to this deal: " },
];

const MODES: Record<AskMode, { label: string; hint: string; icon: Icon }> = {
  ask: { label: "Ask first", hint: "Every change waits for your confirmation", icon: PencilSquareIcon },
  auto: { label: "Act on safe changes", hint: "Edits happen at once; deletions and links still ask", icon: BoltIcon },
};

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 5 ? "Working late." : hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening.";
}

export function AskPanel({
  open,
  onOpenChange,
  context,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: AskContext;
}) {
  const ask = useAsk(context, open);
  const [draft, setDraft] = useState("");
  const [wide, setWide] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const suggestions = context.dealId ? ON_DEAL : GENERAL;
  const empty = ask.messages.length === 0;
  const lastStreaming = ask.messages[ask.messages.length - 1]?.streaming;
  const ModeIcon = MODES[ask.mode].icon;

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: lastStreaming ? "auto" : "smooth" });
  }, [ask.messages, lastStreaming]);

  // Grows with what is typed, up to six lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 6 * 22 + 16)}px`;
  }, [draft]);

  const submit = (text = draft) => {
    if (!text.trim() || ask.busy) return;
    setDraft("");
    ask.send(text);
  };

  const pick = (s: Suggestion) => {
    // Prompts ending in a space want the rest typed; the others go straight away.
    if (s.prompt.endsWith(" ")) {
      setDraft(s.prompt);
      inputRef.current?.focus();
    } else {
      submit(s.prompt);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className={cn(
          "flex flex-col gap-0 p-0 transition-[width,max-width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] data-[side=right]:w-full",
          wide
            ? "data-[side=right]:sm:w-[720px] data-[side=right]:sm:max-w-[720px]"
            : "data-[side=right]:sm:w-[460px] data-[side=right]:sm:max-w-[460px]"
        )}
      >
        <SheetTitle className="sr-only">Ask Closingly</SheetTitle>
        <SheetDescription className="sr-only">
          Ask about your deals and calls, or tell it what to change. Changes wait for your confirmation.
        </SheetDescription>

        {/* Header: which conversation, and the panel's own controls. */}
        <header className="flex items-center gap-1 border-b border-border px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-secondary"
              >
                <AskMark size={20} state={ask.busy ? "thinking" : "idle"} />
                <span className="truncate text-[13.5px] font-medium tracking-tight">
                  {ask.title ?? "New conversation"}
                </span>
                <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuItem onSelect={ask.reset} className="gap-2 text-[13px]">
                <PlusIcon className="size-4" strokeWidth={1.8} />
                New conversation
              </DropdownMenuItem>
              {ask.conversations.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[11.5px] text-muted-foreground">Recent</DropdownMenuLabel>
                  <div className="max-h-64 overflow-y-auto">
                    {ask.conversations.map((c) => (
                      <DropdownMenuItem
                        key={c.id}
                        onSelect={() => ask.openConversation(c.id)}
                        className="justify-between gap-2 text-[13px]"
                      >
                        <span className="truncate">{c.title}</span>
                        {c.id === ask.conversationId && <CheckIcon className="size-3.5 shrink-0 text-brand" strokeWidth={2.2} />}
                      </DropdownMenuItem>
                    ))}
                  </div>
                </>
              )}
              {ask.conversationId && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => ask.conversationId && ask.removeConversation(ask.conversationId)}
                    className="gap-2 text-[13px] text-destructive focus:text-destructive"
                  >
                    <TrashIcon className="size-4" strokeWidth={1.7} />
                    Delete this conversation
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="ml-auto flex items-center">
            <Button variant="ghost" size="icon-sm" onClick={ask.reset} aria-label="New conversation" title="New conversation">
              <PlusIcon className="size-4" strokeWidth={1.8} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setWide((v) => !v)}
              aria-label={wide ? "Narrow the panel" : "Widen the panel"}
              title={wide ? "Narrow" : "Widen"}
              className="max-sm:hidden"
            >
              {wide ? <ArrowsPointingInIcon className="size-4" strokeWidth={1.8} /> : <ArrowsPointingOutIcon className="size-4" strokeWidth={1.8} />}
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)} aria-label="Close">
              <XMarkIcon className="size-4" strokeWidth={1.8} />
            </Button>
          </div>
        </header>

        <div className="ask-canvas min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <AnimatePresence mode="wait" initial={false}>
            {empty ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                className="flex min-h-full flex-col px-5 pb-6 pt-10 sm:pt-14"
              >
                <div className="flex flex-col items-center text-center">
                  <motion.div
                    initial={{ scale: 0.7, opacity: 0, y: 8 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 22 }}
                  >
                    <AskMark size={60} />
                  </motion.div>
                  <h2 className="mt-5 text-[25px] leading-tight">{greeting()}</h2>
                  <p className="mt-1.5 max-w-[34ch] text-[13px] leading-relaxed text-muted-foreground">
                    {context.dealId
                      ? "Ask about this deal, or tell me what to change on it."
                      : "Ask about your deals and calls, or tell me what to change. Nothing changes until you confirm it."}
                  </p>
                </div>

                <ul className="mx-auto mt-8 w-full max-w-[400px] space-y-1.5">
                  {suggestions.map((s, i) => (
                    <motion.li
                      key={s.title}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: 0.08 + i * 0.045, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <button
                        type="button"
                        onClick={() => pick(s)}
                        className="group flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-px hover:border-brand/40 hover:shadow-[0_6px_16px_-10px_oklch(0.517_0.116_250/0.45)] active:translate-y-0"
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand transition-colors group-hover:bg-brand group-hover:text-brand-fg">
                          <s.icon className="size-4" strokeWidth={1.8} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium tracking-tight">{s.title}</span>
                          <span className="block truncate text-[11.5px] text-muted-foreground">{s.hint}</span>
                        </span>
                      </button>
                    </motion.li>
                  ))}
                </ul>
              </motion.div>
            ) : (
              <motion.div key="thread" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 px-5 py-5">
                {ask.messages.map((m) => (
                  <AskMessageView
                    key={m.id}
                    message={m}
                    onDecide={ask.decide}
                    onNavigate={() => onOpenChange(false)}
                  />
                ))}
                <div ref={endRef} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Composer */}
        <div className="border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="rounded-2xl border border-input bg-card px-3 pt-2.5 shadow-[0_1px_2px_oklch(0.215_0.012_90/0.04)] transition-[border-color,box-shadow] focus-within:border-brand/60 focus-within:shadow-[0_0_0_3px_oklch(0.517_0.116_250/0.12)]">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder={context.dealId ? "Ask about this deal, or say what to change" : "Ask anything, or say what to change"}
              aria-label="Message Ask Closingly"
              className="block max-h-[148px] min-h-[22px] w-full resize-none bg-transparent text-[13.5px] leading-[22px] outline-none placeholder:text-muted-foreground"
            />
            <div className="flex items-center justify-between gap-2 pb-2 pt-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="-ml-1 inline-flex h-7 items-center gap-1.5 rounded-full border border-border px-2.5 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ModeIcon className="size-3.5" strokeWidth={1.8} />
                    {MODES[ask.mode].label}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" className="w-72">
                  {(Object.keys(MODES) as AskMode[]).map((key) => {
                    const M = MODES[key];
                    return (
                      <DropdownMenuItem key={key} onSelect={() => ask.setMode(key)} className="items-start gap-2.5 py-2">
                        <M.icon className="mt-0.5 size-4 text-muted-foreground" strokeWidth={1.8} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium">{M.label}</span>
                          <span className="block text-[11.5px] leading-snug text-muted-foreground">{M.hint}</span>
                        </span>
                        {ask.mode === key && <CheckIcon className="mt-0.5 size-4 text-brand" strokeWidth={2.2} />}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

              {ask.busy ? (
                <Button size="icon-sm" variant="outline" onClick={ask.stop} aria-label="Stop" className="rounded-full">
                  <StopIcon className="size-3.5" strokeWidth={2} />
                </Button>
              ) : (
                <Button
                  size="icon-sm"
                  variant="brand"
                  onClick={() => submit()}
                  disabled={!draft.trim()}
                  aria-label="Send"
                  className="rounded-full transition-transform active:scale-90"
                >
                  <ArrowUpIcon className="size-3.5" strokeWidth={2.4} />
                </Button>
              )}
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Answers come from your own workspace. Check anything important.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
