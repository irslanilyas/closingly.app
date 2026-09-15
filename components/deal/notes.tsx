"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Lock, Trash2, Plus, X } from "lucide-react";

/**
 * The things a transcript cannot hold.
 *
 * A recording captures what was said. It does not capture that the CFO went
 * quiet when the number came up, that the champion is leaving in March, or
 * that the extracted budget signal is wrong. Those are the notes, and they are
 * private by default: generation is only ever allowed to read a note that has
 * been deliberately marked shareable.
 */

interface Note {
  id: string;
  body: string;
  is_private: boolean;
  created_at: string;
}

export function DealNotes({ dealId }: { dealId: string }) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const read = useCallback(async (): Promise<Note[] | null> => {
    const supabase = createClient();
    const { data } = await supabase
      .from("deal_notes")
      .select("id, body, is_private, created_at")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false });
    return (data as Note[] | null) ?? [];
  }, [dealId]);

  useEffect(() => {
    let cancelled = false;
    read().then((next) => {
      if (!cancelled && next) setNotes(next);
    });
    return () => {
      cancelled = true;
    };
  }, [read]);

  const add = async () => {
    const body = draft.trim();
    if (!body || saving) return;

    setSaving(true);
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;

    const { data, error } = await supabase
      .from("deal_notes")
      .insert({ deal_id: dealId, user_id: auth.user.id, body })
      .select("id, body, is_private, created_at")
      .single();

    setSaving(false);

    if (error || !data) {
      toast.error("Couldn't save that note.");
      return;
    }

    setNotes((current) => [data as Note, ...(current ?? [])]);
    setDraft("");
    setComposing(false);

    // The deal's own timeline should show that context was added, so a note is
    // visible from the activity log rather than only from this panel.
    await supabase.from("deal_events").insert({
      deal_id: dealId,
      user_id: auth.user.id,
      kind: "note_added",
    });
  };

  const remove = async (id: string) => {
    const previous = notes;
    setNotes((current) => (current ?? []).filter((n) => n.id !== id));

    const supabase = createClient();
    const { error } = await supabase.from("deal_notes").delete().eq("id", id);

    if (error) {
      toast.error("Couldn't delete that.");
      setNotes(previous);
    }
  };

  const toggleShareable = async (note: Note) => {
    const next = !note.is_private;
    setNotes((current) =>
      (current ?? []).map((n) =>
        n.id === note.id ? { ...n, is_private: next } : n
      )
    );

    const supabase = createClient();
    const { error } = await supabase
      .from("deal_notes")
      .update({ is_private: next })
      .eq("id", note.id);

    if (error) {
      toast.error("Couldn't change that.");
      setNotes((current) =>
        (current ?? []).map((n) =>
          n.id === note.id ? { ...n, is_private: note.is_private } : n
        )
      );
    }
  };

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="label">Your notes</div>
        {!composing && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setComposing(true)}
            className="text-[12px] gap-1"
          >
            <Plus strokeWidth={2} />
            Add
          </Button>
        )}
      </div>

      {composing && (
        <div className="mb-3 resolve">
          <Textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add();
              if (e.key === "Escape") {
                setComposing(false);
                setDraft("");
              }
            }}
            placeholder="What you noticed that the recording didn't catch."
            className="min-h-[90px] text-[13px] leading-relaxed"
          />
          <div className="mt-2 flex items-center gap-2">
            <Button
              variant="brand"
              size="sm"
              onClick={add}
              disabled={saving || !draft.trim()}
              className="text-[12.5px]"
            >
              Save note
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setComposing(false);
                setDraft("");
              }}
              className="text-[12.5px] text-muted-foreground gap-1"
            >
              <X strokeWidth={1.8} />
              Cancel
            </Button>
            <span className="ml-auto text-[11px] text-muted-foreground">
              Private unless you say otherwise
            </span>
          </div>
        </div>
      )}

      {notes === null ? (
        <div className="h-16 rounded-lg bg-muted animate-pulse" aria-hidden />
      ) : notes.length === 0 && !composing ? (
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          Nothing yet. Notes are for what the transcript missed: the read on the
          room, who actually decides, what you would price differently.
        </p>
      ) : (
        <ol className="space-y-2">
          {notes.map((note) => (
            <li key={note.id} className="panel group px-3.5 py-3">
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed">
                {note.body}
              </p>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-[11.5px] text-muted-foreground">
                  {formatDistanceToNow(new Date(note.created_at), {
                    addSuffix: true,
                  })}
                </span>

                <button
                  type="button"
                  onClick={() => toggleShareable(note)}
                  title={
                    note.is_private
                      ? "Private. Closingly will never put this in a client-facing document."
                      : "Shareable. Closingly may draw on this when writing for the client."
                  }
                  className={cn(
                    "inline-flex items-center gap-1 text-[11.5px] transition-colors",
                    note.is_private
                      ? "text-muted-foreground hover:text-foreground"
                      : "text-brand"
                  )}
                >
                  <Lock className="size-3" strokeWidth={1.8} />
                  {note.is_private ? "Private" : "Usable in drafts"}
                </button>

                <button
                  type="button"
                  onClick={() => remove(note.id)}
                  aria-label="Delete note"
                  className="ml-auto text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Trash2 className="size-3.5" strokeWidth={1.6} />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
