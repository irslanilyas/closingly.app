import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { field } from "@/lib/validate";
import type { AskMessage, AskPart } from "@/lib/ask/parts";

/**
 * One saved conversation, with each action card's current status: a card
 * confirmed after the turn was saved must reopen as done, not as a question.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!field.id.safeParse(id).success) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [{ data: conversation }, { data: rows }, { data: actions }] = await Promise.all([
    supabase.from("ask_conversations").select("id, title").eq("id", id).maybeSingle(),
    supabase
      .from("ask_messages")
      .select("id, role, content, parts")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true })
      .limit(100),
    supabase.from("ask_actions").select("id, status, result, error").eq("conversation_id", id),
  ]);
  if (!conversation) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const now = new Map((actions ?? []).map((a) => [a.id as string, a]));
  const messages: AskMessage[] = (rows ?? []).map((row) => ({
    id: row.id as string,
    role: row.role as AskMessage["role"],
    content: row.content as string,
    parts: ((row.parts as AskPart[] | null) ?? []).map((part) => {
      if (part.type !== "action") return part;
      const live = now.get(part.action.id);
      return live
        ? {
            ...part,
            action: {
              ...part.action,
              status: live.status as typeof part.action.status,
              result: (live.result as typeof part.action.result) ?? part.action.result,
              error: (live.error as string | null) ?? part.action.error,
            },
          }
        : part;
    }),
  }));

  return NextResponse.json({ id: conversation.id, title: conversation.title, messages });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!field.id.safeParse(id).success) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Writes to these tables are server-only; ownership is enforced here.
  await createAdminClient().from("ask_conversations").delete().eq("id", id).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
