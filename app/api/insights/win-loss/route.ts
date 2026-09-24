import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  WIN_LOSS_MIN_SAMPLE,
  type TemplateWinRate,
  type WinLossInsights,
  type WinLossStats,
} from "@/lib/types";


export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: deals, error } = await supabase
    .from("deals")
    .select("id, stage, proposed_amount, created_at")
    .eq("user_id", user.id)
    .in("stage", ["won", "lost"]);
  if (error) {
    console.error("[insights/win-loss] read failed:", error.message);
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }

  const closed = deals ?? [];
  if (closed.length < WIN_LOSS_MIN_SAMPLE) {
    const body: WinLossInsights = {
      insufficient_data: true,
      closed_count: closed.length,
      needed: WIN_LOSS_MIN_SAMPLE,
    };
    return NextResponse.json(body);
  }

  const dealIds = closed.map((d) => d.id);

  const { data: events } = await supabase
    .from("deal_events")
    .select("deal_id, kind, to_value, created_at")
    .in("deal_id", dealIds)
    .in("kind", ["followup_generated", "stage_changed"]);

  const { data: proposals } = await supabase
    .from("proposals")
    .select("deal_id, template_id, templates(name)")
    .in("deal_id", dealIds);

  const followupCounts = new Map<string, number>();
  const closedAt = new Map<string, string>();
  for (const e of events ?? []) {
    if (e.kind === "followup_generated") {
      followupCounts.set(e.deal_id, (followupCounts.get(e.deal_id) ?? 0) + 1);
    }
    if (
      e.kind === "stage_changed" &&
      (e.to_value === "won" || e.to_value === "lost")
    ) {
      // Last transition into a closed stage wins, in case a deal flip-flopped.
      closedAt.set(e.deal_id, e.created_at);
    }
  }

  const templateByDeal = new Map<string, { id: string; name: string }>();
  for (const p of proposals ?? []) {
    if (!p.template_id) continue;
    const tmpl = Array.isArray(p.templates) ? p.templates[0] : p.templates;
    templateByDeal.set(p.deal_id, {
      id: p.template_id,
      name: (tmpl as { name?: string } | null)?.name ?? "Unnamed template",
    });
  }

  function statsFor(stage: "won" | "lost"): WinLossStats {
    const group = closed.filter((d) => d.stage === stage);
    const amounts = group
      .map((d) => d.proposed_amount)
      .filter((n): n is number => n != null);
    const followups = group.map((d) => followupCounts.get(d.id) ?? 0);
    const days = group
      .map((d) => {
        const at = closedAt.get(d.id);
        if (!at) return null;
        const ms = new Date(at).getTime() - new Date(d.created_at).getTime();
        return ms > 0 ? ms / 86_400_000 : null;
      })
      .filter((n): n is number => n != null);

    return {
      count: group.length,
      avg_proposed_amount: amounts.length ? avg(amounts) : null,
      avg_followups: followups.length ? avg(followups) : 0,
      avg_days_to_close: days.length ? avg(days) : null,
    };
  }

  const byTemplate = new Map<string, TemplateWinRate>();
  for (const d of closed) {
    const t = templateByDeal.get(d.id);
    if (!t) continue;
    const entry = byTemplate.get(t.id) ?? {
      template_id: t.id,
      template_name: t.name,
      won: 0,
      lost: 0,
      win_rate: 0,
    };
    if (d.stage === "won") entry.won += 1;
    else entry.lost += 1;
    byTemplate.set(t.id, entry);
  }
  const by_template = Array.from(byTemplate.values())
    .map((t) => ({ ...t, win_rate: t.won / (t.won + t.lost) }))
    // A single data point isn't a rate — needs at least two closed deals.
    .filter((t) => t.won + t.lost >= 2)
    .sort((a, b) => b.win_rate - a.win_rate);

  const body: WinLossInsights = {
    insufficient_data: false,
    won: statsFor("won"),
    lost: statsFor("lost"),
    by_template,
  };
  return NextResponse.json(body);
}

function avg(nums: number[]): number {
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}
