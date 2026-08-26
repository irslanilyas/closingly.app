/**
 * Kimi (Moonshot) client.
 *
 * Separate from lib/anthropic.ts on purpose. Claude does the reasoning that
 * touches money — extraction, refinement — where a wrong answer costs the user
 * a deal. Kimi does design, where the downside is an ugly proposal and the
 * upside is a much cheaper token.
 */

const BASE_URL = "https://api.moonshot.ai/v1";

export const KIMI_MODEL = "kimi-k3";

/**
 * Reasoning is charged against the same budget as the answer, and running out
 * does not truncate the reply visibly — it returns an empty `content` with
 * finish_reason "length", which reads exactly like a model that chose to say
 * nothing. Sized well above what a template actually needs (~250 tokens).
 */
const MAX_TOKENS = 4096;

/**
 * Measured, on the template prompt:
 *
 *   k2.6, default effort   193s   7,101 reasoning tokens
 *   k3,   default effort    44s     951
 *   k3,   low effort     7 – 19s      28 – 45
 *
 * Same quality at every setting, because the prompt already enumerates every
 * legal value — there is nothing to deliberate about, so the deliberation was
 * pure cost. The fast one is also the only one that fits in a request: Vercel
 * caps a function at 60s and k2.6 took three times that.
 */
const REASONING_EFFORT = "low";

export class KimiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false
  ) {
    super(message);
    this.name = "KimiError";
  }
}

export async function kimiComplete(opts: {
  prompt: string;
  system?: string;
  maxTokens?: number;
  signal?: AbortSignal;
}): Promise<string> {
  const apiKey = process.env.KIMI_API_KEY;
  if (!apiKey) throw new KimiError("KIMI_API_KEY is not configured");

  const messages: Array<{ role: string; content: string }> = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.prompt });

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: KIMI_MODEL,
      messages,
      max_tokens: opts.maxTokens ?? MAX_TOKENS,
      reasoning_effort: REASONING_EFFORT,
      // Kimi rejects any temperature other than 1 outright, so there is no
      // knob to expose here — variety has to come from the prompt.
      response_format: { type: "json_object" },
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // 429 covers both "too fast" and "out of balance". The first is worth a
    // retry and the second never is, so read the body before deciding.
    const outOfCredit = /insufficient|balance|quota/i.test(body);
    throw new KimiError(
      `Kimi ${res.status}: ${body.slice(0, 200)}`,
      res.status,
      (res.status === 429 && !outOfCredit) || res.status >= 500
    );
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  };

  const choice = json.choices?.[0];
  const content = choice?.message?.content?.trim();

  if (!content) {
    throw new KimiError(
      choice?.finish_reason === "length"
        ? "Kimi spent its whole budget thinking and returned nothing"
        : "Kimi returned an empty response"
    );
  }

  return content;
}
