import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * View tracking for the public share page.
 *
 * Unauthenticated by design — the viewer is a client, not a user. The share
 * token is the only credential, and it only ever grants writes scoped to the
 * proposal it belongs to.
 */

/**
 * Per-proposal salt. Enough to tell two viewers of the same proposal apart,
 * but the same person opening two different proposals hashes differently, so
 * this can't be used to build a cross-proposal profile.
 */
function hashViewer(ip: string, proposalId: string): string {
  return crypto
    .createHash("sha256")
    .update(`${ip}:${proposalId}`)
    .digest("hex")
    .slice(0, 32);
}

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

async function resolveProposal(token: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("proposals")
    .select("id, share_expires_at")
    .eq("share_token", token)
    .single();

  if (!data) return null;
  if (data.share_expires_at && new Date(data.share_expires_at) < new Date()) {
    return null;
  }
  return data;
}

/** Record that the proposal was opened. Returns a view id for later updates. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const proposal = await resolveProposal(token);
  if (!proposal) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("proposal_views")
    .insert({
      proposal_id: proposal.id,
      ip_hash: hashViewer(clientIp(request), proposal.id),
      user_agent: request.headers.get("user-agent")?.slice(0, 400) ?? null,
      referrer: request.headers.get("referer")?.slice(0, 400) ?? null,
    })
    .select("id")
    .single();

  if (error) {
    // Tracking must never break the page for the client reading it.
    console.error("[track] insert failed:", error);
    return NextResponse.json({ view_id: null });
  }

  return NextResponse.json({ view_id: data.id });
}

/** Update dwell time and which sections were actually read. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const body = (await request.json().catch(() => ({}))) as {
    view_id?: string;
    duration_seconds?: number;
    sections_viewed?: string[];
  };

  if (!body.view_id) {
    return NextResponse.json({ error: "missing_view_id" }, { status: 400 });
  }

  const proposal = await resolveProposal(token);
  if (!proposal) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const supabase = createAdminClient();

  // Scoped by proposal_id as well as view_id, so a token can only ever update
  // views belonging to its own proposal.
  await supabase
    .from("proposal_views")
    .update({
      duration_seconds: Math.min(
        Math.max(0, Math.round(body.duration_seconds ?? 0)),
        // A tab left open overnight isn't engagement. Cap at 2 hours.
        7200
      ),
      sections_viewed: body.sections_viewed ?? [],
    })
    .eq("id", body.view_id)
    .eq("proposal_id", proposal.id);

  return NextResponse.json({ ok: true });
}
