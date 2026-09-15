import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { followUpDraftPrompt } from "@/lib/prompts";
import { KIND_LABELS, type FollowUpKind } from "@/lib/follow-ups/rules";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Write (or rewrite) the draft for one queue item.
 *
 * The sweep drafts the most urgent handful automatically; this is the door for
 * everything else, and for "write me a different one" when the first attempt
 * did not land.
 */
const RATE_LIMIT = { action: "follow_up_draft", limit: 40, windowMinutes: 60 };

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
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limit = await checkRateLimit(user.id, RATE_LIMIT);
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

  const body = (await request.json().catch(() => ({}))) as {
    instruction?: string;
  };

  const { data: item } = await supabase
    .from("follow_ups")
    .select(
      "id, kind, reason, deal_id, deals ( client_name, client_company, pain_point, budget_signal, timeline, stage )"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!item) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const deal = (Array.isArray(item.deals) ? item.deals[0] : item.deals) as
    | Record<string, string | null>
    | null;

  // A steer from the user is appended to the situation rather than spliced
  // into the rules section, so it can shape tone without overriding the
  // "never invent a fact" constraints below it in the prompt.
  const steer =
    typeof body.instruction === "string" && body.instruction.trim()
      ? ` The sender asked for this specifically: ${body.instruction.trim().slice(0, 300)}`
      : "";

  const prompt = followUpDraftPrompt({
    situation: `${KIND_LABELS[item.kind as FollowUpKind]} — ${item.reason}${steer}`,
    client_name: deal?.client_name ?? "there",
    client_company: deal?.client_company ?? "",
    pain_point: deal?.pain_point ?? "",
    budget_signal: deal?.budget_signal ?? "",
    timeline: deal?.timeline ?? "",
    stage: deal?.stage ?? "lead",
  });

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 700,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();

    const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    const parsed = JSON.parse(fenced ? fenced[1] : text) as {
      subject?: unknown;
      body?: unknown;
    };

    if (typeof parsed.subject !== "string" || typeof parsed.body !== "string") {
      throw new Error("draft missing subject or body");
    }

    const draft = {
      draft_subject: parsed.subject.trim(),
      draft_body: parsed.body.trim(),
      drafted_at: new Date().toISOString(),
    };

    await supabase
      .from("follow_ups")
      .update(draft)
      .eq("id", id)
      .eq("user_id", user.id);

    return NextResponse.json(draft);
  } catch (err) {
    console.error("[follow-ups] draft failed:", err);
    return NextResponse.json({ error: "draft_failed" }, { status: 502 });
  }
}
