import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type {
  Deal,
  DealEvent,
  Meeting,
  Proposal,
  ProposalVersion,
  ProposalView,
  Template,
} from "@/lib/types";

export const maxDuration = 30;

/**
 * Everything a user has ever put into Closingly, as one downloadable file.
 *
 * Deliberately uses the RLS-scoped client, not the admin client. Every table
 * here already has a "you can only see your own rows" policy — reusing that
 * instead of hand-writing `.eq("user_id", ...)` nine times means there's one
 * place a scoping bug could exist (the policy itself, already exercised by
 * every other page in the app) instead of nine new ones in this file alone.
 *
 * `google_tokens` on the profile is deliberately excluded: it's a live
 * credential, not content — a downloaded copy of your own OAuth refresh
 * token sitting in a JSON file on disk is a real credential to protect, and
 * "your data" shouldn't include a way back into your Google account.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [
    profile,
    deals,
    meetings,
    proposals,
    proposalVersions,
    proposalViews,
    templates,
    dealEvents,
    generations,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, email, full_name, username, website, avatar_url, recording_seconds_used, recording_seconds_limit, created_at"
      )
      .eq("id", user.id)
      .single(),
    supabase.from("deals").select("*"),
    supabase.from("meetings").select("*"),
    supabase.from("proposals").select("*"),
    supabase
      .from("proposal_versions")
      .select("*, proposals!inner(user_id)")
      .eq("proposals.user_id", user.id),
    supabase
      .from("proposal_views")
      .select("*, proposals!inner(user_id)")
      .eq("proposals.user_id", user.id),
    // Built-ins (user_id null) aren't this user's data — only their own.
    supabase.from("templates").select("*").eq("user_id", user.id),
    supabase.from("deal_events").select("*"),
    supabase.from("generations").select("*"),
  ]);

  const strip = <T extends { proposals?: unknown }>(rows: T[] | null) =>
    (rows ?? []).map(({ proposals: _proposals, ...rest }) => rest);

  const payload = {
    exported_at: new Date().toISOString(),
    profile: profile.data,
    deals: (deals.data ?? []) as Deal[],
    meetings: (meetings.data ?? []) as Meeting[],
    proposals: (proposals.data ?? []) as Proposal[],
    proposal_versions: strip(proposalVersions.data) as unknown as ProposalVersion[],
    proposal_views: strip(proposalViews.data) as unknown as ProposalView[],
    templates: (templates.data ?? []) as Template[],
    deal_events: (dealEvents.data ?? []) as DealEvent[],
    generations: generations.data ?? [],
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="ros-export-${user.id}.json"`,
    },
  });
}
