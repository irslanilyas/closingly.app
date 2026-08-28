import { type NextRequest } from "next/server";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { followUpPrompt } from "@/lib/prompts";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT = { action: "followup_generate", limit: 30, windowMinutes: 60 };

export async function POST(request: NextRequest) {
  try {
    const { situation, deal_id } = await request.json();
    if (!situation || typeof situation !== "string")
      return new Response("Missing situation", { status: 400 });

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return new Response("Unauthorized", { status: 401 });

    const limit = await checkRateLimit(user.id, RATE_LIMIT);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    let dealContext: string | undefined;
    if (deal_id) {
      const { data } = await supabase
        .from("deals")
        .select(
          "client_name, client_company, stage, pain_point, timeline, budget_signal"
        )
        .eq("id", deal_id)
        .single();
      if (data) {
        dealContext = `Client: ${data.client_name ?? "—"} at ${data.client_company ?? "—"}. Current stage: ${data.stage}. Pain: ${data.pain_point ?? "n/a"}. Timeline: ${data.timeline ?? "n/a"}. Budget: ${data.budget_signal ?? "n/a"}.`;
      }
    }

    const encoder = new TextEncoder();
    let full = "";
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const response = anthropic.messages.stream({
            model: CLAUDE_MODEL,
            max_tokens: 2048,
            messages: [
              { role: "user", content: followUpPrompt(situation, dealContext) },
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
              deal_id: deal_id ?? null,
              module: "followup_writer",
              input: situation,
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
