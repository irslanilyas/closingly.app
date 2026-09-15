"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

/**
 * Onboarding asks business questions, so its controls have to read like
 * questions rather than a form. Every choice here is a visible card: a select
 * hides the options behind a click and makes the answer feel administrative,
 * and these answers steer everything the product later writes.
 */

export function Field({
  label,
  hint,
  optional,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline gap-2">
        <label
          htmlFor={htmlFor}
          className="text-[13.5px] font-medium tracking-tight"
        >
          {label}
        </label>
        {optional && (
          <span className="text-[11.5px] text-muted-foreground">Optional</span>
        )}
      </div>
      {hint && (
        <p className="text-[12.5px] text-muted-foreground leading-relaxed -mt-1">
          {hint}
        </p>
      )}
      {children}
    </div>
  );
}

interface Option {
  value: string;
  label: string;
  hint?: string;
}

export function ChoiceGrid<T extends string>({
  options,
  value,
  onChange,
  columns = 2,
  name,
}: {
  options: ReadonlyArray<Option>;
  value: T | null;
  onChange: (value: T) => void;
  columns?: 1 | 2 | 3;
  name: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className={cn(
        "grid gap-2",
        columns === 1 && "grid-cols-1",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-3"
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value as T)}
            className={cn(
              "text-left rounded-lg border px-3.5 py-3 row-lift",
              selected
                ? "border-brand bg-brand-soft/60 text-foreground"
                : "border-border bg-card hover:border-foreground/25"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-[13.5px] leading-snug">{option.label}</span>
              {selected && (
                <Check className="size-3.5 shrink-0 mt-0.5 text-brand" strokeWidth={2.4} />
              )}
            </div>
            {option.hint && (
              <div className="mt-1 text-[11.5px] text-muted-foreground leading-snug">
                {option.hint}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Multi-select for the document outline.
 *
 * The four sections a proposal is meaningless without are locked on rather
 * than merely pre-checked. Letting someone remove "Investment and terms" would
 * produce a document that cannot do its job, and discovering that after a
 * client reads it is not a recoverable mistake.
 */
export function SectionPicker({
  options,
  value,
  locked,
  onChange,
}: {
  options: ReadonlyArray<Option>;
  value: string[];
  locked: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (key: string) => {
    if (locked.includes(key)) return;
    onChange(
      value.includes(key) ? value.filter((v) => v !== key) : [...value, key]
    );
  };

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => {
        const isLocked = locked.includes(option.value);
        const checked = isLocked || value.includes(option.value);

        return (
          <button
            key={option.value}
            type="button"
            role="checkbox"
            aria-checked={checked}
            aria-disabled={isLocked}
            onClick={() => toggle(option.value)}
            className={cn(
              "text-left rounded-lg border px-3.5 py-3 row-lift",
              checked
                ? "border-brand bg-brand-soft/60"
                : "border-border bg-card hover:border-foreground/25",
              isLocked && "cursor-default"
            )}
          >
            <div className="flex items-start gap-2.5">
              <span
                className={cn(
                  "mt-[3px] grid size-[15px] shrink-0 place-items-center rounded-[4px] border",
                  checked
                    ? "border-brand bg-brand text-brand-fg"
                    : "border-foreground/30"
                )}
              >
                {checked && <Check className="size-2.5" strokeWidth={3} />}
              </span>
              <div className="min-w-0">
                <div className="text-[13.5px] leading-snug">
                  {option.label}
                  {isLocked && (
                    <span className="ml-1.5 text-[11px] text-muted-foreground">
                      always included
                    </span>
                  )}
                </div>
                {option.hint && (
                  <div className="mt-0.5 text-[11.5px] text-muted-foreground leading-snug">
                    {option.hint}
                  </div>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function SwatchGrid({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ value: string; label: string; swatch: readonly string[] }>;
  value: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "text-left rounded-lg border p-2.5 row-lift",
              selected
                ? "border-brand bg-brand-soft/60"
                : "border-border bg-card hover:border-foreground/25"
            )}
          >
            <span
              aria-hidden
              className="flex h-9 w-full overflow-hidden rounded-md border border-black/5"
            >
              {option.swatch.map((hex) => (
                <span key={hex} style={{ background: hex }} className="flex-1" />
              ))}
            </span>
            <span className="mt-2 block text-[12.5px] leading-snug">
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
