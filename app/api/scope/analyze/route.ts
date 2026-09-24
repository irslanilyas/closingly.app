import { type NextRequest } from "next/server";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { scopePrompt } from "@/lib/prompts";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { z } from "zod";
import { readJson } from "@/lib/validate";

/** Both go into a model prompt verbatim, so both are bounded. */
const Body = z.object({
  sow: z.string().trim().min(1).max(20_000),
  message: z.string().trim().min(1).max(8_000),
});


const RATE_LIMIT = { action: "scope_analyze", limit: 30, windowMinutes: 60 };

export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request, Body);
    if (!body.ok) return body.response;
    const { sow, message } = body.data;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return new Response("Unauthorized", { status: 401 });

    const limit = await checkRateLimit(user.id, RATE_LIMIT);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const encoder = new TextEncoder();
    let full = "";
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const response = anthropic.messages.stream({
            model: CLAUDE_MODEL,
            max_tokens: 1500,
            messages: [{ role: "user", content: scopePrompt(sow, message) }],
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
          supabase
            .from("generations")
            .insert({
              user_id: user.id,
              module: "scope_guardian",
              input: JSON.stringify({ sow, message }),
              output: full,
            })
            .then(() => {});
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
  } catch (err) {
    console.error(err);
    return new Response("Server error", { status: 500 });
  }
}
