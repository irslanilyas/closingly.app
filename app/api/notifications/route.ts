import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { field, readJson } from "@/lib/validate";
import { UNREAD_CAP } from "@/lib/notifications";


/** The bell. Recent notifications plus the unread count for the badge. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const unreadOnly = request.nextUrl.searchParams.get("unread") === "1";

  let query = supabase
    .from("notifications")
    .select("id, kind, title, body, href, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (unreadOnly) query = query.is("read_at", null);

  const [{ data, error }, { count }] = await Promise.all([
    query,
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null),
  ]);

  if (error) {
    console.error("[notifications] list failed:", error.message);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  return NextResponse.json({
    notifications: data ?? [],
    unread: Math.min(count ?? 0, UNREAD_CAP),
    unread_exact: count ?? 0,
  });
}

/** Mark one read, or all of them. */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = await readJson(
    request,
    z.object({ id: field.id.optional(), all: z.boolean().optional() })
  );
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const now = new Date().toISOString();

  let query = supabase
    .from("notifications")
    .update({ read_at: now })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (!body.all) {
    if (!body.id) {
      return NextResponse.json({ error: "missing_id" }, { status: 400 });
    }
    query = query.eq("id", body.id);
  }

  const { error } = await query;

  if (error) {
    console.error("[notifications] mark read failed:", error.message);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
