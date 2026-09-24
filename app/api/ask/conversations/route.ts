import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** The person's recent Ask conversations, newest first, for the history menu. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("ask_conversations")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false })
    .limit(20);

  // Before the migration exists there is simply no history to show.
  if (error) return NextResponse.json({ conversations: [] });
  return NextResponse.json({ conversations: data ?? [] });
}
