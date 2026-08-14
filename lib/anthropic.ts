import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

/** Extraction and generation. The prompts in lib/prompts.ts are tuned to this. */
export const CLAUDE_MODEL = "claude-sonnet-4-6";

/**
 * Classification only. Triage runs on every transcript, so it wants to be
 * cheap — Haiku is a fifth the price and the task is a four-way label.
 */
export const CLAUDE_FAST_MODEL = "claude-haiku-4-5";

/**
 * Parse a JSON response, tolerating the markdown fences models sometimes add
 * despite being told not to.
 */
export function parseJsonResponse<T>(raw: string): T {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Fall back to the outermost braces — occasionally there's a stray
    // sentence before or after the object.
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    }
    throw new Error("Model did not return parseable JSON");
  }
}

/** Non-streaming call that returns the concatenated text content. */
export async function complete(opts: {
  model: string;
  prompt: string;
  maxTokens: number;
}): Promise<string> {
  const response = await anthropic.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens,
    messages: [{ role: "user", content: opts.prompt }],
  });

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}
