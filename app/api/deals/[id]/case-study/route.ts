import { type NextRequest } from "next/server";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { caseStudyPrompt } from "@/lib/prompts";
import { createClient } from "@/lib/supabase/server";
import { checkAiBudget, rateLimitResponse } from "@/lib/rate-limit";
import { notesForPrompt } from "@/lib/deal-notes";


const RATE_LIMIT = { action: "deal_case_study", limit: 20, windowMinutes: 60 };

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const limit = await checkAiBudget(user.id, RATE_LIMIT);
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

  const { data: deal, error } = await supabase
    .from("deals")
    .select(
      "id, client_name, client_company, stage, pain_point, budget_signal, timeline, proposed_amount, notes, transcript"
    )
    .eq("id", id)
    .single();
  if (error || !deal) return new Response("Deal not found", { status: 404 });
  if (deal.stage !== "won")
    return new Response("Deal isn't marked won", { status: 400 });

  const dealContext = `Client: ${deal.client_name ?? "unknown"} at ${deal.client_company ?? "unknown"}. Pain: ${deal.pain_point ?? "n/a"}. Timeline: ${deal.timeline ?? "n/a"}. Proposed amount: ${deal.proposed_amount ?? "n/a"}. Notes: ${await notesForPrompt(supabase, id, deal.notes, "client")}.`;

  const encoder = new TextEncoder();
  let full = "";
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = anthropic.messages.stream({
          model: CLAUDE_MODEL,
          max_tokens: 1200,
          messages: [
            {
              role: "user",
              content: caseStudyPrompt(dealContext, deal.transcript ?? ""),
            },
          ],
        });
        for await (const event of response) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            full += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        await supabase.from("generations").insert({
          user_id: user.id,
          deal_id: id,
          module: "case_study",
          input: dealContext,
          output: full,
        });
        await supabase.from("deal_events").insert({
          deal_id: id,
          user_id: user.id,
          kind: "case_study_generated",
        });
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
