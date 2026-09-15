import type { SupabaseClient } from "@supabase/supabase-js";
import { STAGE_LABELS, STAGE_PROBABILITY, type DealStage } from "@/lib/types";

/**
 * Builds the context Ask Closingly is allowed to answer from.
 *
 * The whole value of asking this rather than a general model is that the
 * answer comes from the person's own calls and deals. So retrieval is
 * deliberately conservative: a keyword pass over what they own, plus a
 * standing summary of the pipeline, and nothing else. If the answer is not in
 * here the model is told to say so rather than reason its way to a plausible
 * number.
 *
 * Not embeddings. A consultant's workspace is hundreds of rows, and a keyword
 * match over client names and pain points finds the right deal essentially
 * always. An embedding index would be a pipeline to maintain, a cost per
 * write, and a new way to return the confidently wrong deal.
 */

/** Words too common to narrow anything. Dropped before matching. */
const STOP_WORDS = new Set([
  "what", "when", "where", "which", "who", "whom", "why", "how", "did", "does",
  "do", "the", "a", "an", "and", "or", "but", "for", "with", "about", "from",
  "into", "over", "under", "was", "were", "is", "are", "be", "been", "being",
  "have", "has", "had", "my", "me", "i", "we", "our", "us", "you", "your",
  "they", "them", "their", "it", "its", "this", "that", "these", "those",
  "say", "said", "says", "tell", "show", "give", "get", "much", "many", "most",
  "last", "quarter", "month", "week", "year", "deal", "deals", "client",
  "clients", "proposal", "proposals", "call", "calls", "meeting", "meetings",
]);

/** Long enough to be meaningful; "ai" and "ux" are the shortest real terms. */
const MIN_TERM = 2;
const MAX_TERMS = 6;

export function extractTerms(question: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];

  for (const raw of question.toLowerCase().split(/[^a-z0-9&'-]+/)) {
    const word = raw.replace(/^['-]+|['-]+$/g, "");
    if (word.length < MIN_TERM) continue;
    if (STOP_WORDS.has(word)) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    terms.push(word);
    if (terms.length >= MAX_TERMS) break;
  }

  return terms;
}

export interface AskContext {
  pipeline: {
    open_count: number;
    open_value: number;
    weighted_value: number;
    by_stage: Array<{ stage: string; count: number; value: number }>;
    won_count: number;
    won_value: number;
    lost_count: number;
  };
  deals: Array<Record<string, unknown>>;
  meetings: Array<Record<string, unknown>>;
  followUps: Array<Record<string, unknown>>;
  /** True when the question matched nothing, so the model must say so. */
  matchedNothing: boolean;
}

/** Escapes the characters that would otherwise be ilike wildcards or filter syntax. */
function sanitise(term: string): string {
  return term.replace(/[%_,()]/g, "");
}

/** Transcript excerpts are the expensive part of the context. Kept tight. */
const TRANSCRIPT_CHARS = 2400;
const MATCHED_DEALS = 5;

export async function buildContext(
  supabase: SupabaseClient,
  userId: string,
  question: string
): Promise<AskContext> {
  const terms = extractTerms(question).map(sanitise).filter(Boolean);

  const { data: allDeals } = await supabase
    .from("deals")
    .select(
      "id, client_name, client_company, stage, proposed_amount, pain_point, budget_signal, timeline, decision_maker, fit_score, competitor_mentioned, created_at, updated_at"
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(300);

  const deals = allDeals ?? [];

  // The standing summary. Always included, because most questions people ask
  // are about the shape of the pipeline rather than one client.
  const byStage = new Map<string, { count: number; value: number }>();
  let openCount = 0;
  let openValue = 0;
  let weighted = 0;
  let wonCount = 0;
  let wonValue = 0;
  let lostCount = 0;

  for (const d of deals) {
    const stage = d.stage as DealStage;
    const amount = (d.proposed_amount as number | null) ?? 0;
    const bucket = byStage.get(stage) ?? { count: 0, value: 0 };
    bucket.count += 1;
    bucket.value += amount;
    byStage.set(stage, bucket);

    if (stage === "won") {
      wonCount += 1;
      wonValue += amount;
    } else if (stage === "lost") {
      lostCount += 1;
    } else {
      openCount += 1;
      openValue += amount;
      weighted += amount * STAGE_PROBABILITY[stage];
    }
  }

  // Score every deal against the question's terms, then take the best few.
  const scored = deals
    .map((d) => {
      const haystack = [
        d.client_name,
        d.client_company,
        d.pain_point,
        d.budget_signal,
        d.timeline,
        d.decision_maker,
        d.competitor_mentioned,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      // A name match is worth more than a match buried in a pain point.
      const nameField = `${d.client_name ?? ""} ${d.client_company ?? ""}`.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (nameField.includes(term)) score += 3;
        else if (haystack.includes(term)) score += 1;
      }
      return { deal: d, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MATCHED_DEALS);

  const matchedIds = scored.map((r) => r.deal.id as string);

  // Transcripts only for deals the question actually pointed at. Pulling every
  // transcript would be the single most expensive thing this product does.
  const { data: meetings } = matchedIds.length
    ? await supabase
        .from("meetings")
        .select("id, deal_id, title, starts_at, meeting_kind, transcript")
        .eq("user_id", userId)
        .in("deal_id", matchedIds)
        .order("starts_at", { ascending: false })
        .limit(MATCHED_DEALS)
    : { data: [] };

  const { data: followUps } = await supabase
    .from("follow_ups")
    .select("reason, kind, priority, deal_id, status")
    .eq("user_id", userId)
    .eq("status", "open")
    .order("priority", { ascending: true })
    .limit(10);

  return {
    pipeline: {
      open_count: openCount,
      open_value: openValue,
      weighted_value: Math.round(weighted),
      by_stage: [...byStage.entries()].map(([stage, v]) => ({
        stage: STAGE_LABELS[stage as DealStage] ?? stage,
        count: v.count,
        value: v.value,
      })),
      won_count: wonCount,
      won_value: wonValue,
      lost_count: lostCount,
    },
    deals: scored.map((r) => r.deal),
    meetings: (meetings ?? []).map((m) => ({
      ...m,
      transcript:
        typeof m.transcript === "string"
          ? m.transcript.slice(0, TRANSCRIPT_CHARS)
          : null,
    })),
    followUps: followUps ?? [],
    matchedNothing: terms.length > 0 && scored.length === 0,
  };
}
