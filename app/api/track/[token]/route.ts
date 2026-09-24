import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications";
import { z } from "zod";
import { checkRateLimitByKey, clientIp } from "@/lib/rate-limit";
import { field, readJson } from "@/lib/validate";

/**
 * Per viewer network and share link. A real reader opens a proposal a handful
 * of times and sends a heartbeat every so often; these ceilings are far above
 * that and far below what it would take to flood a proposal's analytics.
 */
const OPEN_LIMIT = { action: "track_open", limit: 30, windowMinutes: 10 };
const BEAT_LIMIT = { action: "track_beat", limit: 300, windowMinutes: 10 };

/** Section keys are generated from the document's own headings. */
const Beat = z.object({
  view_id: field.id,
  duration_seconds: z.number().finite().min(0).max(1_000_000).default(0),
  sections_viewed: z
    .array(z.string().regex(/^[a-z0-9_]{1,40}$/))
    .max(20)
    .default([]),
});

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

async function resolveProposal(token: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("proposals")
    .select("id, share_expires_at, user_id, deal_id")
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

  const limit = await checkRateLimitByKey(`${clientIp(request)}:${token}`, OPEN_LIMIT);
  if (!limit.ok) return NextResponse.json({ ok: true }, { status: 429 });

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

  // "Your client is reading it right now" is the single most useful thing this
  // product knows. Fired here rather than on a schedule so it is genuinely
  // live. Deduped on the proposal, so a client refreshing four times while
  // they read does not produce four notifications.
  await announceOpen(proposal.id, proposal.user_id as string, proposal.deal_id as string | null);

  return NextResponse.json({ view_id: data.id });
}

async function announceOpen(
  proposalId: string,
  userId: string,
  dealId: string | null
) {
  const supabase = createAdminClient();

  try {
    const { count } = await supabase
      .from("proposal_views")
      .select("id", { count: "exact", head: true })
      .eq("proposal_id", proposalId);

    const views = count ?? 1;
    const first = views <= 1;

    const { data: deal } = dealId
      ? await supabase
          .from("deals")
          .select("client_name, client_company")
          .eq("id", dealId)
          .maybeSingle()
      : { data: null };

    const who =
      deal?.client_company?.trim() || deal?.client_name?.trim() || "Your client";

    await notify({
      userId,
      kind: first ? "proposal_opened" : "proposal_reopened",
      title: first
        ? `${who} opened your proposal`
        : `${who} came back to your proposal`,
      body: first
        ? "First open. Worth being reachable for the next hour."
        : `That is open number ${views}. Repeat reads usually mean it is being discussed internally.`,
      href: dealId ? `/pipeline/${dealId}` : `/proposals/${proposalId}`,
      entityType: "proposal",
      entityId: proposalId,
      dedupeKey: `open:${proposalId}`,
    });

    if (dealId) {
      await supabase.from("deal_events").insert({
        deal_id: dealId,
        user_id: userId,
        kind: "proposal_viewed",
        to_value: String(views),
      });
    }
  } catch (err) {
    // Same rule as above: never break the client's page over bookkeeping.
    console.error("[track] open announcement failed:", err);
  }
}

/** Update dwell time and which sections were actually read. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const limit = await checkRateLimitByKey(`${clientIp(request)}:${token}`, BEAT_LIMIT);
  if (!limit.ok) return NextResponse.json({ ok: true }, { status: 429 });

  const parsed = await readJson(request, Beat);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

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
        Math.round(body.duration_seconds),
        // A tab left open overnight isn't engagement. Cap at 2 hours.
        7200
      ),
      sections_viewed: body.sections_viewed,
    })
    .eq("id", body.view_id)
    .eq("proposal_id", proposal.id);

  return NextResponse.json({ ok: true });
}
