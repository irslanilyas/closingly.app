import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { MeetingProgress } from "@/lib/meetings/progress";

/**
 * Calls that are being recorded, being turned into a deal, or finished in the
 * last few hours. What the "just finished" card and the pipeline's placeholder
 * cards are drawn from.
 *
 * Read through the caller's session, so RLS scopes it to their own calls.
 */

export interface CallActivity {
  id: string;
  title: string;
  status: "recording" | "processing" | "completed" | "failed";
  meeting_kind: string | null;
  deal_id: string | null;
  deal_name: string | null;
  error: string | null;
  progress: MeetingProgress | null;
  starts_at: string | null;
  ends_at: string | null;
  updated_at: string;
  imported: boolean;
}

/** A finished call stays on the page this long, unless dismissed. */
const RECENT_HOURS = 12;
/** An in-flight row older than this is stale history, not something live. */
const LIVE_HOURS = 24;

const COLUMNS =
  "id, title, status, meeting_kind, deal_id, error, starts_at, ends_at, updated_at, recall_bot_id, deals(client_name, client_company)";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const since = new Date(Date.now() - LIVE_HOURS * 3_600_000).toISOString();
  const query = (columns: string) =>
    supabase
      .from("meetings")
      .select(columns)
      .in("status", ["recording", "processing", "completed", "failed"])
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(12);

  // Before the progress column's migration is applied, asking for it fails
  // the whole read; fall back to the rest rather than showing nothing.
  let result = await query(`${COLUMNS}, progress`);
  if (result.error?.message.includes("progress")) result = await query(COLUMNS);
  if (result.error) {
    console.error("[meetings/activity] read failed:", result.error.message);
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }

  const recentCutoff = Date.now() - RECENT_HOURS * 3_600_000;
  const rows = (result.data ?? []) as unknown as Array<Record<string, unknown>>;

  const calls: CallActivity[] = rows
    .map((row) => {
      const deal = (Array.isArray(row.deals) ? row.deals[0] : row.deals) as
        | { client_name: string | null; client_company: string | null }
        | null;
      return {
        id: row.id as string,
        title: (row.title as string | null)?.trim() || "Your call",
        status: row.status as CallActivity["status"],
        meeting_kind: (row.meeting_kind as string | null) ?? null,
        deal_id: (row.deal_id as string | null) ?? null,
        deal_name: deal?.client_company || deal?.client_name || null,
        error: (row.error as string | null) ?? null,
        progress: (row.progress as MeetingProgress | null) ?? null,
        starts_at: (row.starts_at as string | null) ?? null,
        ends_at: (row.ends_at as string | null) ?? null,
        updated_at: row.updated_at as string,
        imported: !row.recall_bot_id,
      };
    })
    .filter((call) => {
      if (call.status === "recording" || call.status === "processing") return true;
      // A finished call only counts if it went through processing recently.
      // updated_at alone is not enough: a calendar sync touches old rows.
      const doneAt = call.progress?.stage_at;
      return !!doneAt && new Date(doneAt).getTime() > recentCutoff;
    });

  return NextResponse.json({ calls });
}
