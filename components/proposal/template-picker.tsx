"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { coerceTheme, type ProposalTheme } from "@/lib/proposal-theme";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Check, Sparkles, Trash2 } from "lucide-react";

export interface TemplateOption {
  id: string;
  name: string;
  description: string | null;
  design: ProposalTheme;
  is_builtin: boolean;
}

/**
 * Switches the design of a proposal. Content is never touched.
 *
 * Templates load lazily — the picker is collapsed until asked for, and most
 * visits to a proposal are to read or edit it, not to redress it.
 */
export function TemplatePicker({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (template: TemplateOption | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<TemplateOption[] | null>(null);
  const [brief, setBrief] = useState("");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!open || templates) return;

    fetch("/api/templates")
      .then((res) => (res.ok ? res.json() : { templates: [] }))
      .then((body) =>
        setTemplates(
          (body.templates ?? []).map((t: TemplateOption) => ({
            ...t,
            // Rows predate the current field list, or were written by an older
            // build. Coercing on read means the picker cannot render a broken
            // swatch no matter what is in the column.
            design: coerceTheme(t.design),
          }))
        )
      )
      .catch(() => setTemplates([]));
  }, [open, templates]);

  const generate = async () => {
    const text = brief.trim();
    if (!text || generating) return;

    setGenerating(true);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: text }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(body.message ?? "Couldn't design that.");
        return;
      }

      const created: TemplateOption = {
        ...body.template,
        design: coerceTheme(body.template.design),
      };

      setTemplates((t) => [...(t ?? []), created]);
      setBrief("");
      onSelect(created);
      toast.success(`${created.name} applied.`);
    } catch {
      toast.error("Couldn't reach the designer. Try again.");
    } finally {
      setGenerating(false);
    }
  };

  const remove = async (template: TemplateOption) => {
    setTemplates((t) => (t ?? []).filter((x) => x.id !== template.id));
    if (selectedId === template.id) onSelect(null);

    const res = await fetch(`/api/templates/${template.id}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      toast.error("Couldn't delete that.");
      setTemplates(null); // Force a refetch rather than guess at the truth.
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-my-2 flex items-center gap-1.5 py-2 text-[12.5px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <Sparkles className="size-3.5" strokeWidth={1.5} />
        Change design
      </button>
    );
  }

  return (
    <div className="rounded-md border border-border p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
          Design
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="-my-2 py-2 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Done
        </button>
      </div>

      {templates === null ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-[76px] rounded-md border border-border animate-pulse bg-secondary/40"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {templates.map((template) => (
            <Swatch
              key={template.id}
              template={template}
              selected={selectedId === template.id}
              onSelect={() => onSelect(template)}
              onDelete={
                template.is_builtin ? undefined : () => remove(template)
              }
            />
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <input
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") generate();
          }}
          disabled={generating}
          placeholder="Warm, understated, a bit editorial…"
          aria-label="Describe a design"
          className="min-w-0 flex-1 rounded-md border border-border bg-transparent px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground focus:border-[var(--brand)]/50 pointer-coarse:py-2.5"
        />
        <Button
          onClick={generate}
          disabled={generating || !brief.trim()}
          className="h-9 gap-1.5 text-[12.5px] bg-[var(--brand)] text-[var(--brand-fg)] hover:bg-[var(--brand)]/90 cursor-pointer shrink-0 pointer-coarse:h-10"
        >
          <Sparkles className="size-3.5" strokeWidth={1.5} />
          {generating ? "Designing…" : "Design one"}
        </Button>
      </div>
      <p className="mt-2 text-[11.5px] text-muted-foreground">
        Describe the impression you want. The words stay exactly as they are.
      </p>
    </div>
  );
}

/**
 * A miniature of the real thing: same paper, ink and accent, same heading face.
 * Cheaper and more honest than a screenshot, and it can never drift from what
 * the document actually renders.
 */
function Swatch({
  template,
  selected,
  onSelect,
  onDelete,
}: {
  template: TemplateOption;
  selected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}) {
  const { design } = template;

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onSelect}
        title={template.description ?? undefined}
        className={cn(
          "w-full text-left rounded-md border overflow-hidden transition-colors",
          selected
            ? "border-[var(--brand)] ring-1 ring-[var(--brand)]/30"
            : "border-border hover:border-muted-foreground/40"
        )}
      >
        <div
          className="px-3 py-3 h-[76px] flex flex-col justify-between"
          style={{ background: design.paper, color: design.ink }}
        >
          <div
            className="text-[11px] font-medium leading-tight truncate"
            style={{
              fontFamily:
                design.heading_font === "sans"
                  ? "var(--font-sans)"
                  : design.heading_font === "mono"
                    ? "var(--font-mono)"
                    : design.heading_font === "display"
                      ? "var(--font-proposal-display)"
                      : "var(--font-serif)",
            }}
          >
            {template.name}
          </div>
          <div className="space-y-1" aria-hidden>
            <div
              className="h-[3px] w-full rounded-full"
              style={{ background: design.ink, opacity: 0.18 }}
            />
            <div
              className="h-[3px] w-2/3 rounded-full"
              style={{ background: design.ink, opacity: 0.18 }}
            />
            <div
              className="h-[7px] w-1/3 rounded-full mt-1.5"
              style={{ background: design.accent }}
            />
          </div>
        </div>
      </button>

      {selected && (
        <span className="absolute top-1.5 right-1.5 grid place-items-center size-4 rounded-full bg-[var(--brand)] text-[var(--brand-fg)]">
          <Check className="size-2.5" strokeWidth={3} />
        </span>
      )}

      {onDelete && !selected && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${template.name}`}
          className="absolute top-1 right-1 grid place-items-center size-7 rounded-full bg-background/85 text-muted-foreground hover:text-foreground transition-opacity pointer-fine:top-1.5 pointer-fine:right-1.5 pointer-fine:size-5 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100"
        >
          <Trash2 className="size-3" strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}
