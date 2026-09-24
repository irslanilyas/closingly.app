import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { field, readJson } from "@/lib/validate";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { ActionError, executeAction, isActionKind, riskOf, summarizeAction } from "@/lib/ask/actions";
import type { ActionView } from "@/lib/ask/parts";

const Body = z.object({ decision: z.enum(["confirm", "cancel"]) });
const RATE_LIMIT = { action: "ask_action", limit: 60, windowMinutes: 60 };

/**
 * The person's answer to an action card.
 *
 * Confirming claims the action first (pending to running, in one conditional
 * update), so a double click or a second tab can never run it twice. The
 * change itself runs through the person's own session, not the service role.
 */
export async function POST(
  request: NextRequest,
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

  const limit = await checkRateLimit(user.id, RATE_LIMIT);
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

  const parsed = await readJson(request, Body);
  if (!parsed.ok) return parsed.response;

  const admin = createAdminClient();
  const { data: action } = await admin
    .from("ask_actions")
    .select("id, kind, params, status, expires_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!action || !isActionKind(action.kind as string)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const kind = action.kind as Parameters<typeof riskOf>[0];

  if (action.status !== "pending") {
    return NextResponse.json({ error: "already_decided", status: action.status }, { status: 409 });
  }
  if (new Date(action.expires_at as string).getTime() < Date.now()) {
    await admin.from("ask_actions").update({ status: "expired" }).eq("id", id).eq("status", "pending");
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  if (parsed.data.decision === "cancel") {
    await admin
      .from("ask_actions")
      .update({ status: "cancelled", decided_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending");
    return NextResponse.json({ status: "cancelled" });
  }

  const { data: claimed } = await admin
    .from("ask_actions")
    .update({ status: "running", decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!claimed) return NextResponse.json({ error: "already_decided" }, { status: 409 });

  const ctx = { supabase, userId: user.id };
  let view: Pick<ActionView, "status" | "result" | "error">;
  try {
    const result = await executeAction(ctx, kind, action.params);
    view = { status: "done", result };
  } catch (err) {
    view = { status: "failed", error: err instanceof ActionError ? err.message : "That didn't work. Nothing was changed." };
  }

  await admin
    .from("ask_actions")
    .update({ status: view.status, result: view.result ?? null, error: view.error ?? null })
    .eq("id", id);

  return NextResponse.json(view, { status: view.status === "done" ? 200 : 422 });
}

/** Re-describe an action (used when a saved conversation is reopened). */
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

  const { data: action } = await supabase
    .from("ask_actions")
    .select("id, kind, params, status, result, error")
    .eq("id", id)
    .maybeSingle();
  if (!action || !isActionKind(action.kind as string)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const kind = action.kind as Parameters<typeof riskOf>[0];
  const summary = await summarizeAction({ supabase, userId: user.id }, kind, action.params).catch(() => ({
    title: "A change that no longer applies",
  }));
  return NextResponse.json({
    id: action.id,
    kind,
    risk: riskOf(kind),
    status: action.status,
    result: action.result,
    error: action.error,
    ...summary,
  });
}
