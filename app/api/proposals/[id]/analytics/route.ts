import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Engagement summary for a shared proposal.
 *
 * The useful signal isn't the view count — it's which sections held attention
 * and whether they came back. A client who re-opens a proposal twice and
 * lingers on Investment is telling you something.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // RLS on proposal_views checks ownership through the parent proposal.
  const { data: views, error } = await supabase
    .from("proposal_views")
    .select("id, ip_hash, opened_at, duration_seconds, sections_viewed")
    .eq("proposal_id", id)
    .order("opened_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }

  const rows = views ?? [];
  const sectionCounts = new Map<string, number>();

  for (const view of rows) {
    for (const section of (view.sections_viewed as string[]) ?? []) {
      sectionCounts.set(section, (sectionCounts.get(section) ?? 0) + 1);
    }
  }

  const totalSeconds = rows.reduce(
    (sum, v) => sum + (v.duration_seconds ?? 0),
    0
  );

  return NextResponse.json({
    total_views: rows.length,
    unique_viewers: new Set(rows.map((v) => v.ip_hash).filter(Boolean)).size,
    last_viewed_at: rows[0]?.opened_at ?? null,
    total_seconds: totalSeconds,
    average_seconds: rows.length ? Math.round(totalSeconds / rows.length) : 0,
    sections: Array.from(sectionCounts, ([section, count]) => ({
      section,
      count,
    })).sort((a, b) => b.count - a.count),
    recent: rows.slice(0, 10).map((v) => ({
      opened_at: v.opened_at,
      duration_seconds: v.duration_seconds,
    })),
  });
}
