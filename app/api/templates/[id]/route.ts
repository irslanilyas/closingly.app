import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Delete one of the caller's own templates.
 *
 * Built-ins are protected by RLS (the delete policy matches on `user_id`, which
 * is null for them) so there is no separate guard here. Proposals using the
 * template fall back to the default look — `proposals.template_id` is
 * ON DELETE SET NULL, so deleting a design never breaks a live share link.
 */
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

  const { error } = await supabase.from("templates").delete().eq("id", id);

  if (error) {
    console.error("[templates] delete failed:", error);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
