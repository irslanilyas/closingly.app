"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Click to edit, blur to save.
 *
 * A textarea rather than contenteditable: contenteditable pastes styled HTML,
 * fights the browser over line breaks, and needs sanitising on every keystroke.
 * A textarea that grows to fit gives the same feel with none of that.
 */
export function EditableField({
  value,
  onSave,
  multiline = false,
  className,
  placeholder = "Empty",
  highlight = false,
}: {
  value: string;
  onSave: (next: string) => void;
  multiline?: boolean;
  className?: string;
  placeholder?: string;
  /** Briefly marks a field the AI just changed. */
  highlight?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Follow the saved value while not editing (a refine can rewrite it), but
  // never yank text out from under someone typing.
  const [synced, setSynced] = useState(value);
  if (value !== synced && !editing) {
    setSynced(value);
    setDraft(value);
  }

  useEffect(() => {
    if (!editing || !ref.current) return;
    const el = ref.current;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    autoGrow(el);
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next !== value.trim()) onSave(next);
  };

  if (editing) {
    return (
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          autoGrow(e.target);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
          // Enter commits on single-line fields; multiline needs it for breaks.
          if (e.key === "Enter" && !multiline) {
            e.preventDefault();
            commit();
          }
        }}
        rows={1}
        className={cn(
          "w-full resize-none bg-secondary/50 rounded-sm px-2 py-1 -mx-2 -my-1",
          "outline-none ring-1 ring-[var(--brand)]/40 focus:ring-[var(--brand)]",
          "font-[inherit] text-[inherit] leading-[inherit] text-foreground",
          className
        )}
      />
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setEditing(true);
        }
      }}
      className={cn(
        "cursor-text rounded-sm px-2 py-1 -mx-2 -my-1 transition-colors",
        "hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        highlight && "bg-[var(--brand)]/10 ring-1 ring-[var(--brand)]/30",
        !value && "text-muted-foreground italic",
        className
      )}
    >
      {value ? (
        multiline ? (
          <span className="whitespace-pre-wrap">{value}</span>
        ) : (
          value
        )
      ) : (
        placeholder
      )}
    </div>
  );
}

function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}
