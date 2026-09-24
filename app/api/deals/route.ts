import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Read-only. Deals are created by the meeting pipeline
 * (lib/pipeline/from-transcript.ts) now — there used to be a manual-entry
 * POST here for the standalone proposal-generator page, removed along with
 * that page.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data, error } = await supabase
    .from("deals")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[deals] read failed:", error.message);
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }
  return NextResponse.json({ deals: data ?? [] });
}
