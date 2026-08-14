"use client";

import { EditableField } from "@/components/proposal/editable-field";
import type { ProposalData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Plus, X } from "lucide-react";

/**
 * Renders proposal_data as a document.
 *
 * Every field is editable in place. The structure is fixed by the schema —
 * sections can't be added or reordered here — which is deliberate: templates,
 * per-section view tracking, and pricing analytics all depend on the shape
 * staying predictable.
 */
export function ProposalDocument({
  data,
  onChange,
  changedKeys = [],
  readOnly = false,
  clientName,
  clientCompany,
}: {
  data: ProposalData;
  onChange?: (next: ProposalData) => void;
  /** Fields the last AI refinement touched, briefly highlighted. */
  changedKeys?: string[];
  readOnly?: boolean;
  clientName?: string | null;
  clientCompany?: string | null;
}) {
  const set = <K extends keyof ProposalData>(key: K, value: ProposalData[K]) =>
    onChange?.({ ...data, [key]: value });

  const setDeliverable = (index: number, value: string) => {
    const next = [...data.deliverables];
    if (value.trim()) next[index] = value;
    else next.splice(index, 1);
    set("deliverables", next);
  };

  return (
    <article className="mx-auto max-w-[680px]">
      <header className="mb-12">
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-3">
          Proposal
        </div>
        <h1 className="text-[28px] sm:text-[32px] font-medium tracking-tight leading-[1.15] text-balance">
          {clientCompany ?? clientName ?? "Untitled proposal"}
        </h1>
        {clientName && clientCompany && (
          <p className="mt-2 text-[14px] text-muted-foreground">
            Prepared for {clientName}
          </p>
        )}
      </header>

      <Section title="The challenge" changed={changedKeys.includes("challenge")}>
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

      <Section title="Approach" changed={changedKeys.includes("approach")}>
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

      <Section
        title="What you get"
        changed={changedKeys.includes("deliverables")}
      >
        <ul className="space-y-2.5">
          {data.deliverables.map((item, i) => (
            <li key={i} className="flex gap-3 group">
              <span
                aria-hidden
                className="mt-[9px] size-1 rounded-full bg-[var(--accent-sage)] shrink-0"
              />
              <div className="flex-1 text-[15px] leading-relaxed">
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
              <span aria-hidden className="mt-[9px] size-1 shrink-0" />
              <button
                type="button"
                onClick={() =>
                  set("deliverables", [...data.deliverables, "New deliverable"])
                }
                className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                <Plus className="size-3" strokeWidth={1.5} />
                Add deliverable
              </button>
            </li>
          )}
        </ul>
      </Section>

      <Section title="Timeline" changed={changedKeys.includes("timeline_phased")}>
        <div className="text-[14.5px] leading-relaxed font-mono">
          <Field
            value={data.timeline_phased}
            onSave={(v) => set("timeline_phased", v)}
            readOnly={readOnly}
            multiline
            highlight={changedKeys.includes("timeline_phased")}
          />
        </div>
      </Section>

      <Section
        title="Investment"
        changed={
          changedKeys.includes("investment_number") ||
          changedKeys.includes("investment_terms")
        }
      >
        <div className="text-[26px] font-medium tracking-tight text-[var(--accent-sage)] tabular-nums">
          <Field
            value={data.investment_number}
            onSave={(v) => set("investment_number", v)}
            readOnly={readOnly}
            highlight={changedKeys.includes("investment_number")}
          />
        </div>
        <div className="mt-2 text-[14px] text-muted-foreground">
          <Field
            value={data.investment_terms}
            onSave={(v) => set("investment_terms", v)}
            readOnly={readOnly}
            highlight={changedKeys.includes("investment_terms")}
          />
        </div>
      </Section>

      <Section title="Next steps" changed={changedKeys.includes("next_steps")}>
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

function Section({
  title,
  children,
  changed,
}: {
  title: string;
  children: React.ReactNode;
  changed?: boolean;
}) {
  return (
    <section
      // Read by the view tracker on the public share page to record which
      // sections the client actually scrolled through.
      data-section={title.toLowerCase().replace(/\s+/g, "_")}
      className={cn(
        "mb-11 transition-colors",
        changed && "-mx-4 px-4 py-2 rounded-md"
      )}
    >
      <h2 className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground mb-3 font-medium">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return <div className="text-[15px] leading-[1.7]">{children}</div>;
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
