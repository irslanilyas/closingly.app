"use client";

import { EditableField } from "@/components/proposal/editable-field";
import {
  DEFAULT_THEME,
  themeVars,
  type ProposalTheme,
} from "@/lib/proposal-theme";
import type { ProposalData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Check, Plus } from "lucide-react";

/**
 * Renders proposal_data as a document.
 *
 * Every field is editable in place. The structure is fixed by the schema —
 * sections can't be added or reordered here — which is deliberate: templates,
 * per-section view tracking, and pricing analytics all depend on the shape
 * staying predictable.
 *
 * `theme` changes only how this looks, never what it contains or what the DOM
 * is called. That separation is what lets a template be generated safely.
 */
export function ProposalDocument({
  data,
  theme = DEFAULT_THEME,
  onChange,
  changedKeys = [],
  readOnly = false,
  clientName,
  clientCompany,
  authorName,
}: {
  data: ProposalData;
  theme?: ProposalTheme;
  onChange?: (next: ProposalData) => void;
  /** Fields the last AI refinement touched, briefly highlighted. */
  changedKeys?: string[];
  readOnly?: boolean;
  clientName?: string | null;
  clientCompany?: string | null;
  authorName?: string | null;
}) {
  const set = <K extends keyof ProposalData>(key: K, value: ProposalData[K]) =>
    onChange?.({ ...data, [key]: value });

  const setDeliverable = (index: number, value: string) => {
    const next = [...data.deliverables];
    if (value.trim()) next[index] = value;
    else next.splice(index, 1);
    set("deliverables", next);
  };

  const title = clientCompany ?? clientName ?? "Untitled proposal";

  return (
    <article
      style={themeVars(theme)}
      className="mx-auto max-w-[680px] font-[family-name:var(--p-body-font)] text-[color:var(--p-ink)]"
    >
      <Header
        theme={theme}
        title={title}
        subtitle={
          clientName && clientCompany ? `Prepared for ${clientName}` : null
        }
        author={authorName}
      />

      <Section index={0} theme={theme} title="The challenge">
        <Body>
          <Field
            value={data.challenge}
            onSave={(v) => set("challenge", v)}
            readOnly={readOnly}
            multiline
            highlight={changedKeys.includes("challenge")}
          />
        </Body>
      </Section>

      <Section index={1} theme={theme} title="Approach">
        <Body>
          <Field
            value={data.approach}
            onSave={(v) => set("approach", v)}
            readOnly={readOnly}
            multiline
            highlight={changedKeys.includes("approach")}
          />
        </Body>
      </Section>

      <Section index={2} theme={theme} title="What you get">
        <ul className={cn(theme.bullet === "card" ? "space-y-2" : "space-y-2.5")}>
          {data.deliverables.map((item, i) => (
            <li
              key={i}
              className={cn(
                "flex gap-3",
                theme.bullet === "card" &&
                  "bg-[var(--p-accent-soft)] px-4 py-3 rounded-[var(--p-radius)]"
              )}
            >
              <Bullet theme={theme} index={i} />
              <div className="flex-1 text-[length:var(--p-body-size)] leading-[var(--p-lead)]">
                <Field
                  value={item}
                  onSave={(v) => setDeliverable(i, v)}
                  readOnly={readOnly}
                  placeholder="Empty — clear to remove"
                />
              </div>
            </li>
          ))}
          {!readOnly && (
            <li className="flex gap-3">
              <span aria-hidden className="mt-[9px] size-4 shrink-0" />
              <button
                type="button"
                onClick={() =>
                  set("deliverables", [...data.deliverables, "New deliverable"])
                }
                className="flex items-center gap-1.5 text-[13px] text-[color:var(--p-muted)] hover:text-[color:var(--p-ink)] transition-colors py-1"
              >
                <Plus className="size-3" strokeWidth={1.5} />
                Add deliverable
              </button>
            </li>
          )}
        </ul>
      </Section>

      <Section index={3} theme={theme} title="Timeline">
        <div className="text-[length:var(--p-body-size)] leading-[var(--p-lead)] font-mono">
          <Field
            value={data.timeline_phased}
            onSave={(v) => set("timeline_phased", v)}
            readOnly={readOnly}
            multiline
            highlight={changedKeys.includes("timeline_phased")}
          />
        </div>
      </Section>

      <Section index={4} theme={theme} title="Investment">
        <div
          className={cn(
            theme.investment === "boxed" &&
              "border border-[var(--p-rule)] rounded-[var(--p-radius)] px-4 py-4 sm:px-5",
            theme.investment === "hero" &&
              "bg-[var(--p-accent-soft)] rounded-[var(--p-radius)] px-4 py-5 text-center sm:px-6 sm:py-6"
          )}
        >
          <div
            className={cn(
              "font-medium tracking-tight tabular-nums text-[color:var(--p-accent)] font-[family-name:var(--p-heading-font)]",
              theme.investment === "hero" ? "text-[34px] sm:text-[40px]" : "text-[26px]"
            )}
          >
            <Field
              value={data.investment_number}
              onSave={(v) => set("investment_number", v)}
              readOnly={readOnly}
              highlight={changedKeys.includes("investment_number")}
            />
          </div>
          <div className="mt-2 text-[14px] text-[color:var(--p-muted)]">
            <Field
              value={data.investment_terms}
              onSave={(v) => set("investment_terms", v)}
              readOnly={readOnly}
              highlight={changedKeys.includes("investment_terms")}
            />
          </div>
        </div>
      </Section>

      <Section index={5} theme={theme} title="Next steps" last>
        <Body>
          <Field
            value={data.next_steps}
            onSave={(v) => set("next_steps", v)}
            readOnly={readOnly}
            multiline
            highlight={changedKeys.includes("next_steps")}
          />
        </Body>
      </Section>
    </article>
  );
}

function Header({
  theme,
  title,
  subtitle,
  author,
}: {
  theme: ProposalTheme;
  title: string;
  subtitle: string | null;
  author?: string | null;
}) {
  const centered = theme.header === "centered";

  return (
    <header
      className={cn(
        "mb-[var(--p-gap)]",
        centered && "text-center",
        theme.header === "rule" && "border-b border-[var(--p-rule)] pb-6",
        theme.header === "block" &&
          "bg-[var(--p-accent)] text-[color:var(--p-paper)] px-5 py-7 rounded-[var(--p-radius)] sm:-mx-6 sm:px-6 sm:py-8"
      )}
    >
      <div
        className={cn(
          "text-[11px] uppercase tracking-[0.18em] mb-3",
          theme.header === "block"
            ? "opacity-70"
            : "text-[color:var(--p-muted)]"
        )}
      >
        Proposal
      </div>
      <h1 className="text-[28px] sm:text-[34px] font-medium tracking-tight leading-[1.15] text-balance font-[family-name:var(--p-heading-font)]">
        {title}
      </h1>
      {subtitle && (
        <p
          className={cn(
            "mt-2 text-[14px]",
            theme.header === "block"
              ? "opacity-80"
              : "text-[color:var(--p-muted)]"
          )}
        >
          {subtitle}
        </p>
      )}
      {author && (
        <p
          className={cn(
            "mt-1 text-[13px]",
            theme.header === "block"
              ? "opacity-70"
              : "text-[color:var(--p-muted)]"
          )}
        >
          By {author}
        </p>
      )}
    </header>
  );
}

function Section({
  title,
  index,
  theme,
  children,
  last,
}: {
  title: string;
  index: number;
  theme: ProposalTheme;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <section
      // Read by the view tracker on the public share page to record which
      // sections the client actually scrolled through. Themes must not change
      // this value — the analytics are keyed on it.
      data-section={title.toLowerCase().replace(/\s+/g, "_")}
      className={cn(
        "mb-[var(--p-gap)]",
        !last && theme.divider === "hairline" && "border-b border-[var(--p-rule)] pb-[var(--p-gap)]",
        !last && theme.divider === "rule" && "border-b-2 border-[var(--p-rule)] pb-[var(--p-gap)]"
      )}
    >
      {theme.section_label !== "hidden" && (
        <h2
          className={cn(
            "mb-3 font-medium",
            theme.section_label === "serif"
              ? "text-[19px] tracking-tight font-[family-name:var(--p-heading-font)] text-[color:var(--p-ink)]"
              : "text-[11px] uppercase tracking-[0.16em] text-[color:var(--p-muted)]"
          )}
        >
          {theme.section_label === "numbered" && (
            <span className="text-[color:var(--p-accent)] mr-2 tabular-nums">
              {String(index + 1).padStart(2, "0")}
            </span>
          )}
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

function Bullet({ theme, index }: { theme: ProposalTheme; index: number }) {
  if (theme.bullet === "check") {
    return (
      <Check
        aria-hidden
        className="mt-[3px] size-4 shrink-0 text-[color:var(--p-accent)]"
        strokeWidth={2}
      />
    );
  }

  if (theme.bullet === "number") {
    return (
      <span
        aria-hidden
        className="mt-[1px] w-4 shrink-0 text-[13px] tabular-nums text-[color:var(--p-accent)]"
      >
        {index + 1}.
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className="mt-[9px] size-1 rounded-full bg-[var(--p-accent)] shrink-0"
    />
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[length:var(--p-body-size)] leading-[var(--p-lead)]">
      {children}
    </div>
  );
}

function Field({
  readOnly,
  ...props
}: React.ComponentProps<typeof EditableField> & { readOnly?: boolean }) {
  if (readOnly) {
    return props.multiline ? (
      <span className="whitespace-pre-wrap">{props.value}</span>
    ) : (
      <>{props.value}</>
    );
  }
  return <EditableField {...props} />;
}
