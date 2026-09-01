import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeClientHealth, healthInputFromEvents } from "@/lib/client-health";
import type { ClientHealth, DealEvent } from "@/lib/types";

export const runtime = "nodejs";

export interface AttentionDeal {
  id: string;
  client_name: string | null;
  client_company: string | null;
  health: ClientHealth;
}

/**
 * Every active deal's health, worst first. Reuses the exact same scoring
 * function the per-deal sidebar card uses — this is that same signal rolled
 * up across the whole pipeline, not a second detector to keep in sync.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: deals, error } = await supabase
    .from("deals")
    .select("id, client_name, client_company")
    .eq("user_id", user.id)
    .in("stage", ["lead", "proposal_sent", "negotiating"]);
  if (error) return new Response(error.message, { status: 500 });

  const active = deals ?? [];
  if (active.length === 0) {
    return NextResponse.json({ deals: [] satisfies AttentionDeal[] });
  }

  const dealIds = active.map((d) => d.id);
  const { data: events } = await supabase
    .from("deal_events")
    .select("*")
    .in("deal_id", dealIds)
    .order("created_at", { ascending: false });

  const eventsByDeal = new Map<string, DealEvent[]>();
  for (const e of (events ?? []) as DealEvent[]) {
    const list = eventsByDeal.get(e.deal_id) ?? [];
    list.push(e);
    eventsByDeal.set(e.deal_id, list);
  }

  const attention: AttentionDeal[] = active
    .map((d) => ({
      id: d.id,
      client_name: d.client_name,
      client_company: d.client_company,
      health: computeClientHealth(
        healthInputFromEvents(eventsByDeal.get(d.id) ?? [])
      ),
    }))
    .filter((d) => d.health.level !== "healthy")
    .sort((a, b) => a.health.score - b.health.score);

  return NextResponse.json({ deals: attention });
}
