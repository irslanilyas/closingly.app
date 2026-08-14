import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";

/** Create (or return) a share link. */
export async function POST(
  request: NextRequest,
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

  const { expires_in_days } = (await request
    .json()
    .catch(() => ({}))) as { expires_in_days?: number };

  const { data: proposal, error: readError } = await supabase
    .from("proposals")
    .select("id, deal_id, share_token")
    .eq("id", id)
    .single();

  if (readError || !proposal) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Reuse the existing token. Regenerating would break a link the client may
  // already have open, and there's a separate revoke for when that's intended.
  const token =
    proposal.share_token ?? crypto.randomBytes(18).toString("base64url");

  const expiresAt = expires_in_days
    ? new Date(Date.now() + expires_in_days * 86_400_000).toISOString()
    : null;

  const { error } = await supabase
    .from("proposals")
    .update({
      share_token: token,
      share_expires_at: expiresAt,
      shared_at: proposal.share_token ? undefined : new Date().toISOString(),
      status: "shared",
    })
    .eq("id", id);

  if (error) {
    console.error("[proposals/share] failed:", error);
    return NextResponse.json({ error: "share_failed" }, { status: 500 });
  }

  if (!proposal.share_token) {
    await supabase.from("deal_events").insert({
      deal_id: proposal.deal_id,
      user_id: user.id,
      kind: "proposal_shared",
      metadata: { proposal_id: id },
    });
  }

  return NextResponse.json({ token, expires_at: expiresAt });
}

/** Revoke the link. Anyone holding it gets a 404 from here on. */
export async function DELETE(
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

  const { error } = await supabase
    .from("proposals")
    .update({ share_token: null, share_expires_at: null, status: "draft" })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "revoke_failed" }, { status: 500 });
  }

  return NextResponse.json({ revoked: true });
}
