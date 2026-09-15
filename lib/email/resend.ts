/**
 * Resend, hand-rolled over fetch rather than through the SDK.
 *
 * The SDK is a dependency, a bundle, and a version to keep current in exchange
 * for one POST. This is the whole surface the product needs.
 */

const ENDPOINT = "https://api.resend.com/emails";

/**
 * Until a domain is verified in Resend, `onboarding@resend.dev` is the only
 * sender that will deliver, and it can only reach the account owner's own
 * address. Set RESEND_FROM once closingly.app is verified.
 */
const DEFAULT_FROM = "Closingly <onboarding@resend.dev>";

export class EmailError extends Error {
  constructor(message: string, readonly status?: number, readonly retryable = false) {
    super(message);
    this.name = "EmailError";
  }
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;

  // Deliberately not a throw. Email is an accessory to every flow that sends
  // one; a missing key should degrade delivery, not break the work.
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set — skipping send");
    return null;
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM ?? DEFAULT_FROM,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new EmailError(
      `Resend responded ${res.status}: ${detail.slice(0, 300)}`,
      res.status,
      // 429 and 5xx are worth another attempt; a 422 bad address is not.
      res.status === 429 || res.status >= 500
    );
  }

  const body = (await res.json().catch(() => ({}))) as { id?: string };
  return body.id ?? null;
}
