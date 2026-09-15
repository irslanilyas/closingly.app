import { type NextRequest } from "next/server";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { askPrompt } from "@/lib/prompts";
import { createClient } from "@/lib/supabase/server";
import { buildContext } from "@/lib/ask/retrieve";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT = { action: "ask", limit: 60, windowMinutes: 60 };
const MAX_QUESTION = 500;

/**
 * Ask Closingly.
 *
 * Streams, because the alternative is a spinner on every question and this is
 * meant to feel like asking rather than querying. The retrieval happens first
 * and is fast; the wait is entirely the model.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return new Response("Unauthorized", { status: 401 });

  const limit = await checkRateLimit(user.id, RATE_LIMIT);
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

  const body = (await request.json().catch(() => ({}))) as { question?: string };
  const question =
    typeof body.question === "string" ? body.question.trim().slice(0, MAX_QUESTION) : "";

  if (question.length < 3) {
    return new Response("Ask a longer question.", { status: 400 });
  }

  const context = await buildContext(supabase, user.id, question);

  const prompt = askPrompt({
    question,
    context: {
      pipeline: context.pipeline,
      matched_deals: context.deals,
      calls_on_those_deals: context.meetings,
      open_follow_ups: context.followUps,
    },
    matchedNothing: context.matchedNothing,
    today: new Date().toISOString().slice(0, 10),
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = anthropic.messages.stream({
          model: CLAUDE_MODEL,
          max_tokens: 1200,
          messages: [{ role: "user", content: prompt }],
        });

        for await (const event of response) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        console.error("[ask] stream failed:", err);
        // Written into the stream rather than thrown: the response has already
        // started, so a status code is no longer available to say this with.
        controller.enqueue(
          encoder.encode(
            "\n\nSomething went wrong reaching the model. Try that again."
          )
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
