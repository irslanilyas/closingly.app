import { type NextRequest } from "next/server";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { pricingPrompt } from "@/lib/prompts";
import { createClient } from "@/lib/supabase/server";
import { latestFacts } from "@/lib/onboarding/persist";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";


const RATE_LIMIT = { action: "pricing_generate", limit: 20, windowMinutes: 60 };

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return new Response("Unauthorized", { status: 401 });

    const limit = await checkRateLimit(user.id, RATE_LIMIT);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    // Pull a few historical deals for context
    const { data: pastDeals } = await supabase
      .from("deals")
      .select(
        "client_company, pain_point, proposed_amount, stage, timeline, budget_signal"
      )
      .not("proposed_amount", "is", null)
      .order("created_at", { ascending: false })
      .limit(10);

    // Their market, not an assumed one. A user who has not onboarded yet gets
    // USD and no floor rather than someone else's currency.
    const facts = await latestFacts(supabase, user.id);

    const prompt = pricingPrompt({
      project_description: body.project_description ?? "",
      industry: body.industry ?? "",
      scope: body.scope ?? "Medium",
      budget_signal: body.budget_signal ?? "",
      timeline: body.timeline ?? "",
      deals_json: JSON.stringify(pastDeals ?? []),
      currency: facts?.commercial.currency ?? "USD",
      pricing_model: facts?.commercial.pricing_model ?? "fixed_project",
      minimum_project_value: facts?.commercial.minimum_project_value ?? null,
      target_audience: facts?.business.target_audience ?? "unknown",
    });

    const encoder = new TextEncoder();
    let full = "";
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const response = anthropic.messages.stream({
            model: CLAUDE_MODEL,
            max_tokens: 1500,
            messages: [{ role: "user", content: prompt }],
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
              module: "pricing_advisor",
              input: JSON.stringify(body),
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
