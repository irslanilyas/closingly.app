import { type NextRequest } from "next/server";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { transcriptCleanPrompt } from "@/lib/prompts";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT = { action: "transcript_clean", limit: 20, windowMinutes: 60 };

export async function POST(request: NextRequest) {
  try {
    const { raw } = await request.json();
    if (!raw || typeof raw !== "string")
      return new Response("Missing raw transcript", { status: 400 });

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
            max_tokens: 4096,
            messages: [
              { role: "user", content: transcriptCleanPrompt(raw) },
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
          supabase
            .from("generations")
            .insert({
              user_id: user.id,
              module: "meeting_transcriber",
              input: raw,
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
