import { createAdminClient } from "@/lib/supabase/admin";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { followUpDraftPrompt } from "@/lib/prompts";
import { notify } from "@/lib/notifications";
import { raiseAll, KIND_LABELS, type RaisedFollowUp } from "./rules";
import { buildSnapshots } from "./snapshot";

/**
 * Turns the rules into rows.
 *
 * Runs on every worker tick. Three properties matter:
 *
 *   - It is idempotent. `dedupe_key` carries a bucket number derived from how
 *     long the situation has persisted, so the same stalled deal raises one
 *     item now and a fresh one only after the threshold passes again.
 *   - It never resurrects dismissed work. The partial unique index covers only
 *     open and snoozed rows, so dismissing something means it stays dismissed
 *     until the situation genuinely changes.
 *   - It writes the draft immediately. A queue where every item needs a
 *     "generate" click is a queue of homework, not a queue of work.
 */

/** Cap per sweep. A cold account with 60 stale deals should not bill 60 drafts. */
const MAX_DRAFTS_PER_SWEEP = 4;

export async function sweepFollowUps(userId: string): Promise<{
  raised: number;
  drafted: number;
}> {
  const supabase = createAdminClient();

  // Same join the pipeline reads, so the board and the queue can never
  // disagree about what a deal needs.
  const snapshots = await buildSnapshots(supabase, userId);
  if (snapshots.length === 0) return { raised: 0, drafted: 0 };

  const candidates = raiseAll(snapshots);
  if (candidates.length === 0) return { raised: 0, drafted: 0 };

  // Skip anything already in the queue under the same key, and anything the
  // person has already dealt with on that deal today.
  const { data: existing } = await supabase
    .from("follow_ups")
    .select("dedupe_key")
    .eq("user_id", userId)
    .in("status", ["open", "snoozed"]);

  const taken = new Set((existing ?? []).map((r) => r.dedupe_key as string));
  const fresh = candidates.filter((c) => !taken.has(c.dedupe_key));
  if (fresh.length === 0) return { raised: 0, drafted: 0 };

  const dealById = new Map(
    snapshots.map((s) => [
      s.id,
      {
        client_name: s.client_name,
        client_company: s.client_company,
        pain_point: s.pain_point,
        budget_signal: s.budget_signal,
        timeline: s.timeline,
        stage: s.stage,
      } as Record<string, unknown>,
    ])
  );

  // Draft only the most urgent handful; the rest arrive without a draft and
  // get one on demand.
  const toDraft = fresh.slice(0, MAX_DRAFTS_PER_SWEEP);
  const drafts = new Map<string, { subject: string; body: string }>();

  for (const item of toDraft) {
    const deal = dealById.get(item.deal_id);
    if (!deal) continue;
    try {
      drafts.set(item.dedupe_key, await draftFor(item, deal));
    } catch (err) {
      // A missing draft is a smaller problem than a missing queue item.
      console.error("[follow-ups] draft failed:", err);
    }
  }

  const rows = fresh.map((item) => {
    const draft = drafts.get(item.dedupe_key);
    return {
      user_id: userId,
      deal_id: item.deal_id,
      kind: item.kind,
      reason: item.reason,
      priority: item.priority,
      due_at: item.due_at,
      dedupe_key: item.dedupe_key,
      source: "auto",
      draft_subject: draft?.subject ?? null,
      draft_body: draft?.body ?? null,
      drafted_at: draft ? new Date().toISOString() : null,
    };
  });

  const { error } = await supabase.from("follow_ups").insert(rows);
  if (error) {
    console.error("[follow-ups] insert failed:", error.message);
    return { raised: 0, drafted: 0 };
  }

  const urgent = fresh.filter((f) => f.priority === 1);
  if (urgent.length > 0) {
    await notify({
      userId,
      kind: "follow_up_due",
      title:
        urgent.length === 1
          ? "One follow-up needs you today"
          : `${urgent.length} follow-ups need you today`,
      body: urgent[0].reason,
      href: "/follow-ups",
      entityType: "follow_up",
    });
  }

  return { raised: rows.length, drafted: drafts.size };
}

/** Writes the message. Short, specific, and never a "just checking in". */
async function draftFor(
  item: RaisedFollowUp,
  deal: Record<string, unknown>
): Promise<{ subject: string; body: string }> {
  const prompt = followUpDraftPrompt({
    situation: `${KIND_LABELS[item.kind]}: ${item.reason}`,
    client_name: (deal.client_name as string) ?? "there",
    client_company: (deal.client_company as string) ?? "",
    pain_point: (deal.pain_point as string) ?? "",
    budget_signal: (deal.budget_signal as string) ?? "",
    timeline: (deal.timeline as string) ?? "",
    stage: deal.stage as string,
  });

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
    throw new Error("draft did not return subject and body");
  }

  return { subject: parsed.subject.trim(), body: parsed.body.trim() };
}
