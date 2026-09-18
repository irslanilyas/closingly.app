import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A deal's notes, flattened for a generation prompt.
 *
 * `deal_notes` is where notes are written, each one private or usable in
 * drafts. `deals.notes` is the single free-text field notes lived in before
 * that; nothing edits it any more, but it is still read so nothing written
 * there is lost. It was always labelled private, so it only ever reaches
 * writing that stays with the user.
 */
export async function notesForPrompt(
  supabase: SupabaseClient,
  dealId: string,
  legacy: string | null,
  audience: "private" | "client"
): Promise<string> {
  let query = supabase
    .from("deal_notes")
    .select("body")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: true });

  if (audience === "client") query = query.eq("is_private", false);

  const { data } = await query;
  const bodies = (data ?? [])
    .map((note) => String(note.body ?? "").trim())
    .filter(Boolean);

  if (audience === "private" && legacy?.trim()) bodies.unshift(legacy.trim());

  return bodies.length > 0 ? bodies.join(" | ") : "n/a";
}
