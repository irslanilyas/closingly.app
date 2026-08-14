import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clearGoogleTokens, getGoogleTokens } from "@/lib/google/auth";

/** Connection state + recording allowance for the Settings page. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [tokens, profile] = await Promise.all([
    getGoogleTokens(user.id),
    createAdminClient()
      .from("profiles")
      .select("recording_seconds_used, recording_seconds_limit")
      .eq("id", user.id)
      .single(),
  ]);

  return NextResponse.json({
    email: user.email,
    // A missing refresh token means we can't act on the user's behalf beyond
    // the first hour, so treat it as disconnected rather than half-connected.
    connected: Boolean(tokens?.refresh_token),
    recording: {
      used_seconds: profile.data?.recording_seconds_used ?? 0,
      limit_seconds: profile.data?.recording_seconds_limit ?? 0,
    },
  });
}

/** Disconnect Google without signing out. */
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await clearGoogleTokens(user.id);
  return NextResponse.json({ connected: false });
}
