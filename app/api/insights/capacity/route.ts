import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeCapacityWeeks } from "@/lib/capacity";
import type { CapacityInsights } from "@/lib/types";


export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("weekly_capacity_hours")
    .eq("id", user.id)
    .single();
  const weeklyCapacityHours = profile?.weekly_capacity_hours ?? 30;

  const { data: deals, error } = await supabase
    .from("deals")
    .select("id, estimated_hours, start_date, target_end_date")
    .eq("user_id", user.id)
    .eq("stage", "won");
  if (error) return new Response(error.message, { status: 500 });

  const all = deals ?? [];
  const scheduled = all.filter(
    (d): d is typeof d & { estimated_hours: number; start_date: string; target_end_date: string } =>
      d.estimated_hours != null && d.start_date != null && d.target_end_date != null
  );

  const weeks = computeCapacityWeeks(scheduled, weeklyCapacityHours);

  const body: CapacityInsights = {
    weekly_capacity_hours: weeklyCapacityHours,
    weeks,
    unscheduled_deal_count: all.length - scheduled.length,
  };
  return NextResponse.json(body);
}
