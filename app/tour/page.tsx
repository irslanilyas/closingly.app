"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRightIcon } from "@heroicons/react/24/outline";
import { AppShellClient } from "@/components/app-shell-client";
import { ProductStory } from "@/components/marketing/product-story";

const STEPS = [
  {
    title: "Connect your calendar",
    body: "Closingly finds your client calls. Nothing is recorded until you switch the notetaker on for a specific meeting.",
    link: { href: "/meetings", label: "See your calls" },
  },
  {
    title: "The notetaker joins the call",
    body: "It joins as a visible guest named Closingly Notetaker and records only that call. No call to record? Paste a transcript from another tool instead.",
    link: { href: "/meetings", label: "Import a transcript" },
  },
  {
    title: "The deal and the proposal write themselves",
    body: "A few minutes after the call ends, the deal is in your pipeline with a drafted proposal and a price worked out from your own past deals. Your dashboard shows each step as it happens.",
    link: { href: "/pipeline", label: "Open the pipeline" },
  },
  {
    title: "Share it, and see it being read",
    body: "Send the proposal as a link. You see when they open it, how long they spend, and which sections they read.",
    link: null,
  },
  {
    title: "Nothing goes quiet",
    body: "When a deal stalls or a proposal sits unopened, Closingly drafts the follow-up. You review it and send it from your own Gmail.",
    link: { href: "/follow-ups", label: "Open follow-ups" },
  },
];

/**
 * How Closingly works, in one page: the loop played as an illustration, then
 * the same loop in five plain steps, each with a way into the real thing.
 * Where Ask Closingly sends someone who asks for a demo.
 */
export default function TourPage() {
  const reduce = useReducedMotion();

  return (
    <AppShellClient>
      <div className="mx-auto max-w-[1040px]">
        <header className="mb-8 max-w-[60ch]">
          <h1 className="text-[28px] leading-tight sm:text-[34px]">How Closingly works</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
            One call in, a priced proposal and a tracked deal out, and a nudge whenever something goes quiet.
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
          <section aria-label="An example, played back" className="login-field rounded-[19.2px] px-4 pb-5 pt-6 sm:px-7">
            <ProductStory />
            <p className="mt-4 text-center text-[11.5px] text-white">
              An illustration. The client, call and figures are made up.
            </p>
          </section>

          <ol className="relative">
            <span aria-hidden className="absolute bottom-3 left-[13px] top-3 w-px bg-border" />
            {STEPS.map((step, i) => (
              <motion.li
                key={step.title}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.1 + i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                className="relative flex gap-4 pb-7 last:pb-0"
              >
                <span className="relative z-10 grid size-[27px] shrink-0 place-items-center rounded-full border border-brand/35 bg-card text-[12px] font-medium tabular-nums text-brand">
                  {i + 1}
                </span>
                <div className="min-w-0 pt-0.5">
                  <h2 className="font-sans text-[15px] font-medium">{step.title}</h2>
                  <p className="mt-1 max-w-[52ch] text-[13.5px] leading-relaxed text-muted-foreground">{step.body}</p>
                  {step.link && (
                    <Link
                      href={step.link.href}
                      className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-brand underline-offset-4 hover:underline"
                    >
                      {step.link.label}
                      <ArrowUpRightIcon className="size-3" strokeWidth={2} />
                    </Link>
                  )}
                </div>
              </motion.li>
            ))}
          </ol>
        </div>

        <p className="mt-10 border-t border-border pt-6 text-[13px] text-muted-foreground">
          Rather ask than click? Press{" "}
          <kbd className="rounded-[3.2px] border border-border bg-card px-1.5 py-0.5 font-sans text-[11.5px] text-foreground">Ctrl J</kbd>{" "}
          anywhere and Ask Closingly will find things, answer questions, and make changes once you confirm them.
        </p>
      </div>
    </AppShellClient>
  );
}
