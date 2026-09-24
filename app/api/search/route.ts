import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";


/**
 * Global search across everything a person owns.
 *
 * Deliberately `ilike` over a handful of columns rather than full-text search:
 * a consultant's whole workspace is hundreds of rows, not millions, and the
 * queries people actually type are a client name or half a company name. A
 * tsvector index here would be machinery earning nothing, and it would lose
 * substring matching, which is what "acm" needs to find "Acme".
 *
 * Revisit when a single account passes a few thousand deals.
 */

const MIN_QUERY = 2;
const PER_GROUP = 6;

export interface SearchHit {
  type: "deal" | "meeting" | "proposal" | "follow_up";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

/**
 * The query is interpolated into a PostgREST `or` filter string, so anything
 * with meaning there is removed: `%`, `_` and `*` are ilike wildcards (PostgREST
 * accepts `*` as an alias for `%`), a comma separates conditions, parentheses
 * group them, and quotes, backslashes and colons change how a value is parsed.
 * What is left can only ever be a literal search term.
 */
function sanitise(raw: string): string {
  return raw
    .replace(/[%_*,()"'\\:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const raw = request.nextUrl.searchParams.get("q") ?? "";
  const q = sanitise(raw);

  if (q.length < MIN_QUERY) {
    return NextResponse.json({ hits: [] });
  }

  const like = `%${q}%`;

  const [deals, meetings, followUps] = await Promise.all([
    supabase
      .from("deals")
      .select("id, client_name, client_company, pain_point, stage, proposed_amount")
      .eq("user_id", user.id)
      .or(
        `client_name.ilike.${like},client_company.ilike.${like},pain_point.ilike.${like}`
      )
      .order("updated_at", { ascending: false })
      .limit(PER_GROUP),
    supabase
      .from("meetings")
      .select("id, title, starts_at, status, deal_id")
      .eq("user_id", user.id)
      .ilike("title", like)
      .order("starts_at", { ascending: false })
      .limit(PER_GROUP),
    supabase
      .from("follow_ups")
      .select("id, reason, status, deal_id")
      .eq("user_id", user.id)
      .in("status", ["open", "snoozed"])
      .ilike("reason", like)
      .limit(PER_GROUP),
  ]);

  const hits: SearchHit[] = [];

  for (const d of deals.data ?? []) {
    const name =
      (d.client_company as string | null)?.trim() ||
      (d.client_name as string | null)?.trim() ||
      "Untitled deal";
    hits.push({
      type: "deal",
      id: d.id as string,
      title: name,
      subtitle:
        (d.pain_point as string | null)?.slice(0, 90) ??
        (d.stage as string),
      href: `/pipeline/${d.id}`,
    });
  }

  for (const m of meetings.data ?? []) {
    hits.push({
      type: "meeting",
      id: m.id as string,
      title: (m.title as string | null) ?? "Untitled meeting",
      subtitle: m.starts_at
        ? new Date(m.starts_at as string).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })
        : null,
      // Meetings have no page of their own; the deal is what you actually
      // want when you search for one.
      href: m.deal_id ? `/pipeline/${m.deal_id}` : "/meetings",
    });
  }

  for (const f of followUps.data ?? []) {
    hits.push({
      type: "follow_up",
      id: f.id as string,
      title: (f.reason as string).slice(0, 90),
      subtitle: "Follow-up",
      href: "/follow-ups",
    });
  }

  return NextResponse.json({ hits });
}
