"use client";

export const dynamic = "force-dynamic";

import { Suspense, useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRightIcon,
  CalendarDaysIcon,
  ExclamationCircleIcon,
  LockClosedIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import { Wordmark } from "@/components/shell/wordmark";
import { Spinner } from "@/components/ui/spinner";
import { ProductStory } from "@/components/marketing/product-story";
import { cn } from "@/lib/utils";

const ERROR_COPY: Record<string, string> = {
  access_denied: "You cancelled the Google sign-in. Try again when you're ready.",
  missing_code: "Google didn't send back a sign-in code. Try again.",
  state_mismatch: "That sign-in link expired. Try again.",
  exchange_failed: "We couldn't complete sign-in. Try again.",
  too_many_attempts: "Too many sign-in attempts from this network. Wait a few minutes, then try again.",
  auth: "Something went wrong signing you in. Try again.",
};

const PROMISES = [
  {
    icon: VideoCameraIcon,
    text: "Only calls you switch on are recorded, and the notetaker joins as a visible guest.",
  },
  {
    icon: CalendarDaysIcon,
    text: "Calendar access finds your client calls. Gmail sends only the follow-ups you approve.",
  },
  {
    icon: LockClosedIcon,
    text: "Your deals and transcripts are walled off to your account at the database.",
  },
];

const EASE = [0.16, 1, 0.3, 1] as const;

function LoginForm() {
  const searchParams = useSearchParams();
  const reduce = useReducedMotion();
  const [submitting, setSubmitting] = useState(false);

  const errorParam = searchParams.get("error");
  const message = errorParam ? ERROR_COPY[errorParam] ?? ERROR_COPY.auth : null;

  const signIn = useCallback(() => {
    if (submitting) return;
    setSubmitting(true);
    window.location.href = "/api/auth/google";
  }, [submitting]);

  const rise = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 12, filter: "blur(6px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
          transition: { duration: 0.7, delay, ease: EASE },
        };

  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* The offer */}
      <section className="flex flex-col px-6 pb-8 pt-7 sm:px-10 lg:min-h-dvh lg:px-12 lg:py-9 xl:px-16">
        <Wordmark href={null} />

        <div className="my-auto w-full max-w-[470px] py-12 lg:py-10">
          <motion.h1 {...rise(0.05)} className="text-[40px] leading-[1.04] tracking-[-0.03em] sm:text-[50px] xl:text-[56px]">
            The call ends.
            <span className="block text-brand">The proposal is already written.</span>
          </motion.h1>

          <motion.p {...rise(0.18)} className="mt-5 max-w-[44ch] text-[15.5px] leading-relaxed text-muted-foreground text-pretty">
            Closingly records the discovery calls you choose, drafts the proposal and the price from what your client
            actually said, and tells you the moment they read it.
          </motion.p>

          <motion.div {...rise(0.3)} className="mt-8">
            {message && (
              <div
                role="alert"
                className="mb-4 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-[13px] leading-snug text-destructive"
              >
                <ExclamationCircleIcon className="mt-px size-4 shrink-0" strokeWidth={1.8} />
                {message}
              </div>
            )}

            <button
              type="button"
              onClick={signIn}
              disabled={submitting}
              className={cn(
                "group relative flex h-12 w-full max-w-[400px] items-center gap-3 rounded-xl bg-brand pl-1.5 pr-4 text-[14.5px] font-medium text-brand-fg outline-none",
                "shadow-[0_1px_2px_oklch(0.25_0.06_252/0.25),0_14px_30px_-12px_oklch(0.517_0.116_250/0.7)]",
                "transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-px hover:bg-[color-mix(in_oklch,var(--brand),black_8%)] hover:shadow-[0_1px_2px_oklch(0.25_0.06_252/0.25),0_18px_36px_-12px_oklch(0.517_0.116_250/0.8)]",
                "focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-0 disabled:cursor-wait disabled:opacity-90"
              )}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-white">
                {submitting ? <Spinner className="size-4 text-brand" /> : <GoogleMark />}
              </span>
              <span className="flex-1 text-left">{submitting ? "Opening Google" : "Continue with Google"}</span>
              <ArrowRightIcon
                className="size-4 opacity-80 transition-transform duration-200 group-hover:translate-x-0.5"
                strokeWidth={2}
              />
            </button>
            <p className="mt-3 text-[12.5px] text-muted-foreground">
              Signing in creates your workspace. Setup takes about two minutes.
            </p>
          </motion.div>

          <motion.ul {...rise(0.42)} className="mt-9 space-y-3.5 border-t border-border pt-7">
            {PROMISES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex gap-3 text-[13px] leading-relaxed text-muted-foreground">
                <Icon className="mt-0.5 size-4 shrink-0 text-brand" strokeWidth={1.7} />
                <span className="text-pretty">{text}</span>
              </li>
            ))}
          </motion.ul>
        </div>

        <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-brand" aria-hidden />
            Private beta, by invitation
          </span>
          <a
            href="/api/demo/reset"
            className="underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
          >
            Sign in as a new visitor (replays setup)
          </a>
        </footer>
      </section>

      {/* The mechanism, playing */}
      <section
        aria-label="How Closingly works, as an example"
        className="login-field relative mx-3 mb-3 flex flex-col overflow-hidden rounded-[28px] px-4 pb-6 pt-7 sm:mx-4 sm:mb-4 sm:px-8 lg:my-4 lg:ml-0 lg:mr-4 lg:justify-center lg:px-10"
      >
        <div className="mx-auto w-full max-w-[600px]">
          <ProductStory />
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[12.5px] font-medium text-white/90">
            <span>Record the call</span>
            <ArrowRightIcon className="size-3.5 opacity-60" strokeWidth={2} aria-hidden />
            <span>Draft the proposal</span>
            <ArrowRightIcon className="size-3.5 opacity-60" strokeWidth={2} aria-hidden />
            <span>Know when they read it</span>
          </div>
          <p className="mt-3 text-center text-[11.5px] text-white/65">
            An illustration. The client, call and figures are made up.
          </p>
        </div>
      </section>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C39.1 35.6 44 30.5 44 24c0-1.3-.1-2.6-.4-3.9z"
      />
    </svg>
  );
}
