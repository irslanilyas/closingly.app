import { getValidAccessToken } from "./auth";

/**
 * Sending mail as the user, through their own Gmail account.
 *
 * This matters more than it looks. A follow-up that goes out from a product's
 * server lands in a different inbox tab, breaks the existing thread, and reads
 * as automation to the person receiving it. Sent through Gmail it is simply an
 * email from the consultant, in their own sent folder, in the thread the
 * client already has open.
 *
 * The `gmail.send` scope has been granted since the first sign-in. It is the
 * narrowest Gmail scope Google offers: it can send, and it cannot read a
 * single message.
 */

const SEND_ENDPOINT =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export class GmailError extends Error {
  constructor(message: string, readonly status?: number, readonly retryable = false) {
    super(message);
    this.name = "GmailError";
  }
}

/**
 * RFC 2047 encoding for the subject.
 *
 * A subject line with a client's name in it is very likely to contain a
 * non-ASCII character eventually, and an unencoded one arrives as mojibake.
 */
function encodeHeader(value: string): string {
  const clean = value.replace(/[\r\n]/g, " ").trim();
  if (/^[\x20-\x7E]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

/** Gmail wants base64url, not standard base64. */
function base64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * A header value is attacker-influenced whenever it contains a client name we
 * extracted from a transcript. A bare newline in one would let that content
 * inject arbitrary headers, so they are stripped before assembly rather than
 * trusted.
 */
function headerSafe(value: string): string {
  return value.replace(/[\r\n]/g, " ").trim();
}

export interface GmailMessage {
  to: string;
  subject: string;
  /** Plain text. Gmail renders it as the client expects a real person to write. */
  body: string;
  /** The sender's own address, so Gmail threads it correctly. */
  from: string;
  /** Optional display name for the From header. */
  fromName?: string | null;
}

export async function sendGmail(
  userId: string,
  message: GmailMessage
): Promise<{ id: string; threadId: string }> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    throw new GmailError(
      "Google is not connected, or the connection expired",
      401,
      false
    );
  }

  const from = message.fromName
    ? `${encodeHeader(message.fromName)} <${headerSafe(message.from)}>`
    : headerSafe(message.from);

  const mime = [
    `From: ${from}`,
    `To: ${headerSafe(message.to)}`,
    `Subject: ${encodeHeader(message.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    message.body,
  ].join("\r\n");

  const res = await fetch(SEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: base64Url(mime) }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");

    // 403 here is almost always the scope, not a transient failure — worth
    // saying so, because "try again later" would be wrong advice.
    if (res.status === 403) {
      throw new GmailError(
        "Google refused the send. Reconnect Google from Account to grant sending.",
        403,
        false
      );
    }

    throw new GmailError(
      `Gmail responded ${res.status}: ${detail.slice(0, 300)}`,
      res.status,
      res.status === 429 || res.status >= 500
    );
  }

  const body = (await res.json()) as { id?: string; threadId?: string };
  return { id: body.id ?? "", threadId: body.threadId ?? "" };
}
