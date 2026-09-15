import Anthropic from "@anthropic-ai/sdk";

/**
 * Built on first use, not at import.
 *
 * On Cloudflare Workers, secrets are attached to each request rather than
 * existing at process start. A client constructed at module scope reads
 * `ANTHROPIC_API_KEY` whenever the module happens to be evaluated, and if that
 * is ever before the request has populated the environment, the isolate keeps
 * a keyless client for its whole life: every AI feature fails in production
 * and nowhere else. Deferring construction to the first call closes that off.
 *
 * Exported as a proxy so the nine call sites that use `anthropic.messages`
 * keep working unchanged. A constructor that throws for a missing key leaves
 * nothing cached, so the next call tries again instead of staying broken.
 */
let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export const anthropic = new Proxy({} as Anthropic, {
  get(_target, prop) {
    const real = getClient();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
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
