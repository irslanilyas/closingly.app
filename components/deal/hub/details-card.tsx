"use client";

import { useState } from "react";
import { format } from "date-fns";
import { IdentificationIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/format";
import type { Deal } from "@/lib/types";
import { HubCard } from "./primitives";

type Patch = (partial: Partial<Deal>) => unknown;

const shortDate = (iso: string | null) => (iso ? format(new Date(`${iso}T00:00:00`), "MMM d, yyyy") : null);

/**
 * The facts of the deal, read at a glance. Editing happens in a sheet, so this
 * card stays something you scan rather than a form you tab through.
 */
export function DetailsCard({ deal, onEdit }: { deal: Deal; onEdit: () => void }) {
  const dates =
    deal.start_date || deal.target_end_date
      ? [shortDate(deal.start_date) ?? "Not set", shortDate(deal.target_end_date) ?? "Not set"].join(" to ")
      : null;

  const rows: { label: string; value: React.ReactNode }[] = [
    {
      label: "Contact",
      value: deal.client_email ? (
        <a href={`mailto:${deal.client_email}`} className="break-all text-brand hover:underline">
          {deal.client_email}
        </a>
      ) : null,
    },
    { label: "Decision maker", value: deal.decision_maker },
    { label: "Budget signal", value: deal.budget_signal },
    { label: "Timeline", value: deal.timeline },
    { label: "Dates", value: dates },
    { label: "Estimate", value: deal.estimated_hours != null ? `${deal.estimated_hours} hours` : null },
    { label: "Fit", value: deal.fit_score != null ? `${deal.fit_score} of 10` : null },
    {
      label: "Competition",
      value: deal.competitor_mentioned
        ? [deal.competitor_mentioned, deal.competitive_note].filter(Boolean).join(". ")
        : null,
    },
  ];
  const filled = rows.filter((row) => row.value);

  return (
    <HubCard
      eyebrow="Deal details"
      icon={IdentificationIcon}
      title={deal.pain_point ? undefined : "The facts, at a glance."}
      action={
        <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit details">
          <PencilSquareIcon className="size-4" strokeWidth={1.7} />
        </Button>
      }
    >
      {deal.pain_point && (
        <p className="mt-2 text-[13px] leading-relaxed text-foreground/90">{deal.pain_point}</p>
      )}
      {filled.length > 0 ? (
        <dl className="mt-4 divide-y divide-border border-t border-border">
          {filled.map((row) => (
            <div key={row.label} className="grid grid-cols-[108px_1fr] gap-3 py-2.5 text-[12.5px]">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="min-w-0 leading-relaxed">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <button type="button" onClick={onEdit} className="mt-3 text-[12.5px] font-medium text-brand hover:underline">
          Add who decides, the budget and the timeline
        </button>
      )}
    </HubCard>
  );
}

/** Local draft so typing never fights the network; saved when the field loses focus. */
function Field({
  label,
  value,
  onSave,
  multiline,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onSave: (value: string) => void;
  multiline?: boolean;
  type?: "text" | "email" | "date" | "number";
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }
  const commit = () => draft !== value && onSave(draft.trim());

  return (
    <label className="block">
      <span className="mb-1.5 block text-[11.5px] font-medium text-muted-foreground">{label}</span>
      {multiline ? (
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          placeholder={placeholder}
          className="min-h-[76px] resize-y text-[13px] leading-relaxed"
        />
      ) : (
        <Input
          type={type}
          inputMode={type === "number" ? "decimal" : undefined}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          placeholder={placeholder}
          className="h-9 text-[13px]"
        />
      )}
    </label>
  );
}

function toNumber(value: string): number | null {
  const n = parseFloat(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Every editable fact of the deal. Each field saves on its own. */
export function DealDetailsForm({ deal, onPatch }: { deal: Deal; onPatch: Patch }) {
  const text = (key: keyof Deal) => (deal[key] as string | null) ?? "";
  const save = (key: keyof Deal) => (value: string) => onPatch({ [key]: value || null });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client name" value={text("client_name")} onSave={save("client_name")} />
        <Field label="Company" value={text("client_company")} onSave={save("client_company")} />
      </div>
      <Field label="Email" type="email" value={text("client_email")} onSave={save("client_email")} placeholder="Used to send follow-ups" />
      <Field label="What they need" multiline value={text("pain_point")} onSave={save("pain_point")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Decision maker" value={text("decision_maker")} onSave={save("decision_maker")} />
        <Field label="Timeline" value={text("timeline")} onSave={save("timeline")} />
      </div>
      <Field label="Budget signal" multiline value={text("budget_signal")} onSave={save("budget_signal")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Deal value"
          type="number"
          value={deal.proposed_amount?.toString() ?? ""}
          onSave={(v) => onPatch({ proposed_amount: toNumber(v) })}
          placeholder={deal.proposed_amount == null ? "e.g. 8000" : formatCurrency(deal.proposed_amount)}
        />
        <Field
          label="Estimated hours"
          type="number"
          value={deal.estimated_hours?.toString() ?? ""}
          onSave={(v) => onPatch({ estimated_hours: toNumber(v) })}
        />
        <Field label="Start date" type="date" value={text("start_date")} onSave={save("start_date")} />
        <Field label="Target end date" type="date" value={text("target_end_date")} onSave={save("target_end_date")} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Competitor" value={text("competitor_mentioned")} onSave={save("competitor_mentioned")} />
        <Field label="Competitive note" value={text("competitive_note")} onSave={save("competitive_note")} />
      </div>
      <p className="text-[11.5px] text-muted-foreground">Changes save as you move between fields.</p>
    </div>
  );
}
