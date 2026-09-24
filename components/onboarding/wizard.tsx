"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Wordmark } from "@/components/shell/wordmark";
import { Field, ChoiceGrid, SectionPicker, SwatchGrid } from "./controls";
import { ProposalPreview } from "./preview";
import {
  ROLES,
  SERVICES,
  GOALS,
  VOICES,
  PROPOSAL_SECTIONS,
  COLOR_DIRECTIONS,
  TYPOGRAPHY_DIRECTIONS,
  PRICING_MODELS,
  CURRENCIES,
  REQUIRED_SECTIONS,
  DEFAULT_SECTIONS,
  type Role,
  type Service,
  type Goal,
  type Voice,
  type ColorDirection,
  type TypographyDirection,
  type PricingModel,
  type Currency,
  type ProposalSection,
} from "@/lib/onboarding/schema";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowTrendingUpIcon,
  CalendarDaysIcon,
  CalendarIcon,
  CheckIcon,
  DocumentTextIcon,
  PaperAirplaneIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import { Spinner } from "@/components/ui/spinner";

const STEPS = ["The promise", "Your practice", "Your proposal", "Your calls"];

interface Draft {
  role: Role | null;
  primary_service: Service | null;
  target_audience: string;
  primary_goal: Goal | null;
  website_url: string;
  voice: Voice | null;
  sections: ProposalSection[];
  color_direction: ColorDirection;
  typography_direction: TypographyDirection;
  pricing_model: PricingModel | null;
  currency: Currency;
  minimum_project_value: string;
}

const EMPTY: Draft = {
  role: null,
  primary_service: null,
  target_audience: "",
  primary_goal: null,
  website_url: "",
  voice: null,
  sections: DEFAULT_SECTIONS,
  color_direction: "ink_and_paper",
  typography_direction: "modern_editorial",
  pricing_model: null,
  currency: "USD",
  minimum_project_value: "",
};

export function OnboardingWizard({
  calendarConnected,
}: {
  calendarConnected: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const set = useCallback(
    <K extends keyof Draft>(key: K, value: Draft[K]) =>
      setDraft((d) => ({ ...d, [key]: value })),
    []
  );

  const practiceReady =
    !!draft.role &&
    !!draft.primary_service &&
    draft.target_audience.trim().length >= 2 &&
    !!draft.primary_goal &&
    !!draft.voice;

  const proposalReady = !!draft.pricing_model && draft.sections.length > 0;

  /**
   * Submits at the end of the proposal step, then moves straight on. The
   * person answers the calendar question while generation runs — waiting on a
   * model is the one thing onboarding must never make them do.
   */
  const submit = async () => {
    if (submitting || !practiceReady || !proposalReady) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: draft.role,
          primary_service: draft.primary_service,
          target_audience: draft.target_audience.trim(),
          primary_goal: draft.primary_goal,
          website_url: draft.website_url.trim() || null,
          voice: draft.voice,
          sections: draft.sections,
          color_direction: draft.color_direction,
          typography_direction: draft.typography_direction,
          pricing_model: draft.pricing_model,
          currency: draft.currency,
          minimum_project_value: draft.minimum_project_value.trim() || null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error === "invalid_answers"
            ? "Some answers didn't come through. Check the fields above."
            : "Couldn't save your setup. Try again."
        );
      }

      setGenerating(true);
      setStep(3);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSubmitting(false);
    }
  };

  /** Records the calendar decision and lands them in the workspace. */
  const finish = async (status: "connected" | "skipped") => {
    if (finishing) return;
    setFinishing(true);

    try {
      await fetch("/api/onboarding/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } catch {
      // The decision is a preference, not a gate. Losing it must not trap
      // anyone on the last screen of setup.
    }

    router.push("/");
    router.refresh();
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-[64px] sm:h-[68px] shrink-0 flex items-center justify-between gap-4 pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] sm:px-8">
        <Wordmark href={null} />
        <Progress step={step} />
      </header>

      <main className="flex-1 pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pb-[max(3rem,env(safe-area-inset-bottom))] sm:px-8 sm:pb-16">
        <div className="mx-auto max-w-[1000px]">
          {step === 0 && <Promise onContinue={() => setStep(1)} />}

          {step === 1 && (
            <Screen
              title="Tell me about your practice"
              lede="Six answers. They shape how everything Closingly writes for you sounds, and you can change any of them later."
            >
              <div className="space-y-8 max-w-[620px]">
                <Field label="What do you do?">
                  <ChoiceGrid
                    name="Role"
                    options={ROLES}
                    value={draft.role}
                    onChange={(v) => set("role", v)}
                  />
                </Field>

                <Field label="What do you mostly sell?">
                  <ChoiceGrid
                    name="Primary service"
                    options={SERVICES}
                    value={draft.primary_service}
                    onChange={(v) => set("primary_service", v)}
                  />
                </Field>

                <Field
                  label="Who buys it?"
                  hint="In your words. This is the one answer no dropdown can hold, and it does more for the writing than any other."
                  htmlFor="audience"
                >
                  <Input
                    id="audience"
                    value={draft.target_audience}
                    onChange={(e) => set("target_audience", e.target.value)}
                    placeholder="Seed-stage founders who just raised and have no ops function"
                    maxLength={160}
                    className="h-10 text-[13.5px]"
                  />
                </Field>

                <Field label="What are you trying to fix this year?">
                  <ChoiceGrid
                    name="Primary goal"
                    options={GOALS}
                    value={draft.primary_goal}
                    onChange={(v) => set("primary_goal", v)}
                  />
                </Field>

                <Field label="How should your writing sound?">
                  <ChoiceGrid
                    name="Voice"
                    options={VOICES}
                    value={draft.voice}
                    onChange={(v) => set("voice", v)}
                  />
                </Field>

                <Field
                  label="Website or portfolio"
                  optional
                  hint="Stored with your profile. Nothing is fetched from it without you asking."
                  htmlFor="website"
                >
                  <Input
                    id="website"
                    value={draft.website_url}
                    onChange={(e) => set("website_url", e.target.value)}
                    placeholder="yourstudio.com"
                    className="h-10 text-[13.5px]"
                  />
                </Field>
              </div>

              <Nav
                onBack={() => setStep(0)}
                onNext={() => setStep(2)}
                nextDisabled={!practiceReady}
                nextLabel="Continue"
              />
            </Screen>
          )}

          {step === 2 && (
            <Screen
              title="Now the proposal it writes"
              lede="Your standard outline and how it should look. Every proposal starts from this and adapts to the call."
            >
              <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-8">
                  <Field
                    label="Which sections do your proposals need?"
                    hint="Four are always included. Add the ones you actually use."
                  >
                    <SectionPicker
                      options={PROPOSAL_SECTIONS}
                      value={draft.sections}
                      locked={REQUIRED_SECTIONS}
                      onChange={(next) => set("sections", next as ProposalSection[])}
                    />
                  </Field>

                  <Field label="Colour direction">
                    <SwatchGrid
                      options={COLOR_DIRECTIONS}
                      value={draft.color_direction}
                      onChange={(v) => set("color_direction", v as ColorDirection)}
                    />
                  </Field>

                  <Field label="Type">
                    <ChoiceGrid
                      name="Typography direction"
                      options={TYPOGRAPHY_DIRECTIONS}
                      value={draft.typography_direction}
                      onChange={(v) => set("typography_direction", v)}
                    />
                  </Field>

                  <div className="lg:hidden">
                    <ProposalPreview
                      sections={draft.sections}
                      colorDirection={draft.color_direction}
                      typographyDirection={draft.typography_direction}
                    />
                  </div>

                  <Field
                    label="How do you usually price?"
                    hint="A default and a boundary, not a quote. Closingly never prices a deal it hasn't heard."
                  >
                    <ChoiceGrid
                      name="Pricing model"
                      options={PRICING_MODELS}
                      value={draft.pricing_model}
                      onChange={(v) => set("pricing_model", v)}
                    />
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Currency" htmlFor="currency">
                      <select
                        id="currency"
                        value={draft.currency}
                        onChange={(e) => set("currency", e.target.value as Currency)}
                        className="h-10 w-full rounded-lg border border-input bg-card px-3 text-[13.5px] pointer-coarse:h-11"
                      >
                        {CURRENCIES.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Smallest project you take" optional htmlFor="minimum">
                      <Input
                        id="minimum"
                        inputMode="numeric"
                        value={draft.minimum_project_value}
                        onChange={(e) =>
                          set(
                            "minimum_project_value",
                            e.target.value.replace(/[^\d]/g, "")
                          )
                        }
                        placeholder="5000"
                        className="h-10 text-[13.5px] tabular-nums"
                      />
                    </Field>
                  </div>
                </div>

                <div className="hidden lg:block">
                  <ProposalPreview
                    sections={draft.sections}
                    colorDirection={draft.color_direction}
                    typographyDirection={draft.typography_direction}
                  />
                </div>
              </div>

              <Nav
                onBack={() => setStep(1)}
                onNext={submit}
                nextDisabled={!proposalReady || submitting}
                nextLabel={submitting ? "Saving…" : "Save and continue"}
                busy={submitting}
              />
            </Screen>
          )}

          {step === 3 && (
            <Calls
              generating={generating}
              calendarConnected={calendarConnected}
              finishing={finishing}
              onFinish={finish}
            />
          )}
        </div>
      </main>
    </div>
  );
}

/* ── Chrome ────────────────────────────────────────────────────────────── */

function Progress({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
      <span className="hidden sm:block text-[12px] text-muted-foreground mr-1">
        {STEPS[step]}
      </span>
      {STEPS.map((label, i) => (
        <span
          key={label}
          aria-hidden
          className={cn(
            "h-[3px] rounded-full transition-all duration-300",
            i < step && "w-5 bg-brand/45",
            i === step && "w-9 bg-brand",
            i > step && "w-5 bg-border"
          )}
        />
      ))}
    </div>
  );
}

function Screen({
  title,
  lede,
  children,
}: {
  title: string;
  lede: string;
  children: React.ReactNode;
}) {
  return (
    <div className="warm-in pt-4 sm:pt-10">
      <h1 className="text-[28px] sm:text-[36px] leading-[1.1] tracking-[-0.02em]">
        {title}
      </h1>
      <p className="mt-3 mb-7 sm:mb-9 text-[14px] text-muted-foreground leading-relaxed max-w-[58ch] text-pretty">
        {lede}
      </p>
      {children}
    </div>
  );
}

function Nav({
  onBack,
  onNext,
  nextDisabled,
  nextLabel,
  busy,
}: {
  onBack: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  nextLabel: string;
  busy?: boolean;
}) {
  return (
    <div className="mt-10 flex items-center justify-between gap-3 sm:justify-start">
      <Button variant="ghost" size="lg" onClick={onBack} className="text-[13px]">
        <ArrowLeftIcon strokeWidth={1.6} />
        Back
      </Button>
      <Button
        variant="brand"
        size="lg"
        onClick={onNext}
        disabled={nextDisabled}
        className="text-[13.5px] px-4"
      >
        {busy ? <Spinner className="" /> : null}
        {nextLabel}
        {!busy && <ArrowRightIcon strokeWidth={1.8} />}
      </Button>
    </div>
  );
}

/* ── Step 1 ────────────────────────────────────────────────────────────── */

const LOOP = [
  {
    Icon: VideoCameraIcon,
    title: "It sits in the call",
    body: "Only the meetings you switch it on for. Everyone can see it there.",
  },
  {
    Icon: DocumentTextIcon,
    title: "It writes the proposal",
    body: "From what was actually said, in your sections and your voice.",
  },
  {
    Icon: PaperAirplaneIcon,
    title: "You read it, then send it",
    body: "Nothing reaches a client until you have read it. That never changes.",
  },
  {
    Icon: ArrowTrendingUpIcon,
    title: "It tracks what happens next",
    body: "Which sections they read, what they replied, what that means for the month.",
  },
];

function Promise({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="warm-in pt-6 sm:pt-16 max-w-[720px]">
      <h1 className="text-[31px] sm:text-[44px] leading-[1.08] tracking-[-0.025em]">
        A call becomes a priced proposal, without you writing it
      </h1>
      <p className="mt-4 text-[15px] text-muted-foreground leading-relaxed max-w-[54ch] text-pretty">
        That is the whole loop. Two minutes of setup and the next call you take
        runs through it.
      </p>

      <div className="mt-8 sm:mt-10 grid gap-2.5 sm:gap-3 sm:grid-cols-2">
        {LOOP.map(({ Icon, title, body }, i) => (
          <div
            key={title}
            className="panel p-4 warm-in"
            style={{ animationDelay: `${80 + i * 60}ms` }}
          >
            <Icon className="size-4 text-brand" strokeWidth={1.6} />
            <div className="mt-2.5 text-[13.5px] font-medium tracking-tight">
              {title}
            </div>
            <div className="mt-1 text-[12.5px] text-muted-foreground leading-relaxed">
              {body}
            </div>
          </div>
        ))}
      </div>

      <Button
        variant="brand"
        size="lg"
        onClick={onContinue}
        className="mt-8 sm:mt-9 w-full text-[13.5px] px-4 sm:w-auto"
      >
        Set it up
        <ArrowRightIcon strokeWidth={1.8} />
      </Button>
    </div>
  );
}

/* ── Step 4 ────────────────────────────────────────────────────────────── */

/**
 * The calendar question, answered honestly.
 *
 * Signing in with Google already granted calendar access, so this screen does
 * not pretend to connect anything. It explains what that access is for and
 * asks the one real question: should Closingly watch for client calls, or stay
 * out of the way until asked.
 */
function Calls({
  generating,
  calendarConnected,
  finishing,
  onFinish,
}: {
  generating: boolean;
  calendarConnected: boolean;
  finishing: boolean;
  onFinish: (status: "connected" | "skipped") => void;
}) {
  return (
    <div className="warm-in pt-4 sm:pt-10 max-w-[620px]">
      {generating && (
        <div className="mb-8 flex items-start gap-3 rounded-lg wash border border-brand/25 px-4 py-3">
          <Spinner className="size-4 mt-0.5 shrink-0 text-brand" />
          <div>
            <div className="text-[13.5px] font-medium tracking-tight">
              Your proposal is being written
            </div>
            <div className="mt-0.5 text-[12.5px] text-muted-foreground leading-relaxed">
              It will be waiting in your workspace. You will read it before
              anything is shared.
            </div>
          </div>
        </div>
      )}

      <h1 className="text-[28px] sm:text-[36px] leading-[1.1] tracking-[-0.02em]">
        Last thing: your calls
      </h1>
      <p className="mt-3 text-[14px] text-muted-foreground leading-relaxed text-pretty">
        {calendarConnected
          ? "You granted calendar access when you signed in, so Closingly can already see what's booked. It reads the calendar and never writes to it."
          : "Calendar access didn't come through at sign-in. You can reconnect from Account whenever you want. Nothing here depends on it."}
      </p>

      <div className="mt-7 panel p-4 sm:p-5">
        <div className="flex items-start gap-3">
          {calendarConnected ? (
            <CalendarDaysIcon className="size-4 mt-0.5 shrink-0 text-brand" strokeWidth={1.6} />
          ) : (
            <CalendarIcon className="size-4 mt-0.5 shrink-0 text-muted-foreground" strokeWidth={1.6} />
          )}
          <div>
            <div className="text-[13.5px] font-medium tracking-tight">
              {calendarConnected ? "Calendar connected" : "Calendar not connected"}
            </div>
            <ul className="mt-2.5 space-y-1.5">
              {[
                "Shows you what's coming and who's on it",
                "Offers the notetaker per meeting, never automatically",
                "Recording only ever happens when you switch it on",
              ].map((line) => (
                <li
                  key={line}
                  className="flex items-start gap-2 text-[12.5px] text-muted-foreground leading-relaxed"
                >
                  <CheckIcon className="size-3 mt-1 shrink-0 text-brand" strokeWidth={2.4} />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <Button
          variant="brand"
          size="lg"
          disabled={finishing}
          onClick={() => onFinish(calendarConnected ? "connected" : "skipped")}
          className="text-[13.5px] px-4"
        >
          {finishing && <Spinner className="" />}
          Go to my workspace
          {!finishing && <ArrowRightIcon strokeWidth={1.8} />}
        </Button>

        {calendarConnected && (
          <Button
            variant="ghost"
            size="lg"
            disabled={finishing}
            onClick={() => onFinish("skipped")}
            className="text-[13px] text-muted-foreground"
          >
            Don&rsquo;t watch my calendar for now
          </Button>
        )}
      </div>
    </div>
  );
}
